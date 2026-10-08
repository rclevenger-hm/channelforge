import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../client.js", import.meta.url), "utf8");
const MAX_BYTES = 5 * 1024 * 1024;

// Execute the real browser script, including initialization. Only its empty DOM
// and storage are stubbed; network tests use Node's real fetch/ReadableStream.
function client(fetchImpl = fetch) {
  const timers = new Map();
  const requests = [];
  let nextTimer = 0;
  const element = () => ({ value: "", addEventListener() {}, append() {} });
  const context = vm.createContext({
    document: { querySelector: element, createElement: element },
    localStorage: { getItem: () => null },
    AbortController, TextDecoder, TextEncoder, URL,
    fetch: (url, options) => {
      requests.push(options);
      return fetchImpl(url, options);
    },
    setTimeout: (callback, delay) => {
      assert.equal(delay, 10_000);
      const id = ++nextTimer;
      timers.set(id, callback);
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  });
  vm.runInContext(source, context);
  return {
    load: context.fetchPlaylistText,
    timers, requests,
    expire() {
      assert.equal(timers.size, 1);
      [...timers.values()][0]();
    },
  };
}

async function withServer(handler, run) {
  const server = createServer(handler);
  const sockets = new Set();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  let deadline;
  try {
    await Promise.race([
      run(`http://127.0.0.1:${server.address().port}`),
      new Promise((_resolve, reject) => {
        deadline = setTimeout(() => reject(new Error("Network test exceeded 5 seconds")), 5000);
      }),
    ]);
  } finally {
    clearTimeout(deadline);
    const closed = new Promise((resolve) => server.close(resolve));
    for (const socket of sockets) socket.destroy();
    await closed;
  }
}

test("accepted streamed playlists preserve split UTF-8 and clear their deadline", async () => {
  const text = "#EXTM3U\n#EXTINF:-1,Café 📺\nhttps://example.com/live.m3u8\n";
  const bytes = new TextEncoder().encode(text);
  const stream = new ReadableStream({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  const app = client(async () => new Response(stream));
  assert.equal(await app.load("https://example.com/playlist"), text);
  assert.equal(app.requests[0].cache, "no-store");
  assert.equal(app.timers.size, 0);
  assert.equal(stream.locked, false);
});

test("rejected status and declared-size responses abort unfinished downloads", async () => {
  for (const [status, headers, expected] of [
    [503, {}, /Playlist returned 503/],
    [200, { "content-length": String(MAX_BYTES + 1) }, /byte limit/],
  ]) {
    await withServer((_request, response) => {
      response.writeHead(status, headers);
      response.write("still downloading");
      // Deliberately never end: the client must cancel this response itself.
    }, async (url) => {
      const app = client();
      await assert.rejects(app.load(url), expected);
      assert.equal(app.requests[0].signal.aborted, true);
      assert.equal(app.timers.size, 0);
    });
  }
});

test("unknown-length bodies enforce byte limits and cancel/release the reader", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_BYTES));
      controller.enqueue(Uint8Array.of(1));
    },
    cancel() { cancelled = true; },
  });
  const app = client(async () => new Response(stream));
  await assert.rejects(app.load("https://example.com/large"), /byte limit/);
  assert.equal(cancelled, true);
  assert.equal(stream.locked, false);
  assert.equal(app.timers.size, 0);
});

test("exact byte limit is accepted", async () => {
  const app = client(async () => new Response("a".repeat(MAX_BYTES)));
  assert.equal((await app.load("https://example.com/exact")).length, MAX_BYTES);
  assert.equal(app.timers.size, 0);
});

test("chunked network overflow aborts and a subsequent valid load recovers", async () => {
  await withServer((request, response) => {
    if (request.url === "/large") {
      response.writeHead(200);
      response.write(Buffer.alloc(MAX_BYTES + 1, 97));
    } else {
      response.end("#EXTM3U\nhttps://example.com/live.m3u8\n");
    }
  }, async (url) => {
    const app = client();
    await assert.rejects(app.load(`${url}/large`), /byte limit/);
    assert.equal(app.requests[0].signal.aborted, true);
    assert.equal(app.timers.size, 0);
    assert.equal(await app.load(`${url}/valid`), "#EXTM3U\nhttps://example.com/live.m3u8\n");
    assert.equal(app.requests[1].signal.aborted, false);
    assert.equal(app.timers.size, 0);
  });
});

test("deadlines abort both stalled headers and stalled response bodies", async () => {
  for (const sendHeaders of [false, true]) {
    let received;
    const ready = new Promise((resolve) => { received = resolve; });
    await withServer((_request, response) => {
      if (sendHeaders) {
        response.writeHead(200);
        response.write("#EXTM3U\n");
      }
      received();
    }, async (url) => {
      let headersReceived;
      const headersReady = new Promise((resolve) => { headersReceived = resolve; });
      const app = client(async (...args) => {
        const response = await fetch(...args);
        headersReceived();
        return response;
      });
      const pending = app.load(url);
      const rejection = assert.rejects(pending, /timed out after 10 seconds/);
      await ready;
      if (sendHeaders) {
        await headersReady;
        // Let fetchPlaylistText consume the headers and start reading the body
        // before expiring the deadline. Header-only timeout protection must fail.
        await new Promise((resolve) => setImmediate(resolve));
      }
      app.expire();
      await rejection;
      assert.equal(app.requests[0].signal.aborted, true);
      assert.equal(app.timers.size, 0);
    });
  }
});

test("truncated HTTP bodies fail rather than returning partial playlist text", async () => {
  await withServer((_request, response) => {
    response.writeHead(200, { "content-length": "1000" });
    response.write("#EXTM3U\n");
    setImmediate(() => response.destroy());
  }, async (url) => {
    const app = client();
    await assert.rejects(app.load(url));
    assert.equal(app.timers.size, 0);
  });
});

test("redirect targets retain the original download bound", async () => {
  await withServer((request, response) => {
    if (request.url === "/redirect") {
      response.writeHead(302, { location: "/large" });
      response.end();
    } else {
      response.writeHead(200, { "content-length": String(MAX_BYTES + 1) });
      response.write("oversized redirected playlist");
    }
  }, async (url) => {
    const app = client();
    await assert.rejects(app.load(`${url}/redirect`), /byte limit/);
    assert.equal(app.requests[0].signal.aborted, true);
    assert.equal(app.timers.size, 0);
  });
});

test("non-streaming fallback measures UTF-8 bytes rather than characters", async () => {
  const app = client(async () => ({
    ok: true,
    headers: new Headers(),
    text: async () => "é".repeat(MAX_BYTES / 2 + 1),
  }));
  await assert.rejects(app.load("https://example.com/fallback"), /byte limit/);
  assert.equal(app.timers.size, 0);
});
