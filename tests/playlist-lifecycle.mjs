import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../client.js", import.meta.url), "utf8");
const key = "channelforge.public.channels.v1";
const playlist = (name) => `#EXTM3U\n#EXTINF:-1,${name}\nhttps://example.com/${name}.mp4\n`;

function client() {
  const elements = new Map();
  const storage = new Map();
  const requests = [];
  const element = () => ({
    value: "", textContent: "", hidden: false, events: {},
    classList: { toggle() {} },
    addEventListener(name, callback) { this.events[name] = callback; },
    setAttribute() {}, append() {},
    querySelector: () => element(), cloneNode: () => element(),
    set innerHTML(value) { this.value = value; },
  });
  const video = element();
  Object.assign(video, {
    pauseCount: 0, loadCount: 0, src: "",
    pause() { this.pauseCount++; },
    removeAttribute(name) { if (name === "src") this.src = ""; },
    load() { this.loadCount++; },
    play() { return Promise.resolve(); },
  });
  elements.set("#videoPlayer", video);
  const context = vm.createContext({
    document: {
      querySelector(selector) {
        if (!elements.has(selector)) elements.set(selector, element());
        return elements.get(selector);
      },
      createElement: element,
      createDocumentFragment: element,
    },
    localStorage: {
      getItem: (name) => storage.get(name) ?? null,
      setItem: (name, value) => storage.set(name, value),
      removeItem: (name) => storage.delete(name),
    },
    window: {}, AbortController, TextDecoder, TextEncoder, URL,
    setTimeout, clearTimeout,
    fetch(url, options) {
      return new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
    },
  });
  vm.runInContext(source, context);
  elements.get("#channelTemplate").content = { firstElementChild: element() };
  Object.defineProperty(elements.get("#groupFilter"), "innerHTML", {
    set() { this.value = "all"; },
  });
  elements.get("#groupFilter").value = "all";
  return {
    elements, storage, requests, video,
    run: (code) => vm.runInContext(code, context),
    load(name) {
      elements.get("#playlistText").value = "";
      elements.get("#playlistUrl").value = `https://example.com/${name}.m3u`;
      return context.loadPlaylist();
    },
    paste(name) {
      elements.get("#playlistText").value = playlist(name);
      return context.loadPlaylist();
    },
    clear() { elements.get("#clearData").events.click(); },
    names() { return JSON.parse(JSON.stringify(vm.runInContext("state.channels.map(c => c.name)", context))); },
    storedNames() { return JSON.parse(storage.get(key) || "[]").map(c => c.name); },
  };
}

function finish(request, name) { request.resolve(new Response(playlist(name))); }

test("newer remote loads win even when an older fetch ignores cancellation", async () => {
  const app = client();
  const old = app.load("old");
  const current = app.load("current");
  assert.equal(app.requests[0].options.signal.aborted, true);
  finish(app.requests[1], "Current");
  await current;
  finish(app.requests[0], "Old");
  await old;
  assert.deepEqual(app.names(), ["Current"]);
  assert.deepEqual(app.storedNames(), ["Current"]);
  assert.equal(app.run("state.playlistLoad"), null);
});

test("Clear cancels a pending load and prevents late persistence", async () => {
  const app = client();
  await app.paste("Existing");
  const pending = app.load("old");
  app.clear();
  assert.equal(app.requests[0].options.signal.aborted, true);
  finish(app.requests[0], "Old");
  await pending;
  assert.deepEqual(app.names(), []);
  assert.equal(app.storage.has(key), false);
  assert.equal(app.run("state.playlistLoad"), null);
});

test("pasted playlists supersede downloads and ignore late errors", async () => {
  const app = client();
  const pending = app.load("old");
  await app.paste("Pasted");
  app.requests[0].reject(new Error("Old network error"));
  await pending;
  assert.deepEqual(app.names(), ["Pasted"]);
  assert.deepEqual(app.storedNames(), ["Pasted"]);
  assert.equal(app.requests[0].options.signal.aborted, true);
});

test("failure of the latest load preserves existing channels without reviving an older request", async () => {
  const app = client();
  await app.paste("Existing");
  const old = app.load("old");
  const latest = app.load("latest");
  const rejected = assert.rejects(latest, /Latest failure/);
  app.requests[1].reject(new Error("Latest failure"));
  await rejected;
  finish(app.requests[0], "Old");
  await old;
  assert.deepEqual(app.names(), ["Existing"]);
  assert.deepEqual(app.storedNames(), ["Existing"]);
  await app.paste("Retry");
  assert.deepEqual(app.names(), ["Retry"]);
});

test("an old completion cannot remove cancellation ownership from the current load", async () => {
  const app = client();
  const old = app.load("old");
  const current = app.load("current");
  finish(app.requests[0], "Old");
  await old;
  app.clear();
  assert.equal(app.requests[1].options.signal.aborted, true);
  finish(app.requests[1], "Current");
  await current;
  assert.deepEqual(app.names(), []);
  assert.equal(app.storage.has(key), false);
});

test("Clear stops direct and HLS playback, resets player labels and remains repeatable", async () => {
  const app = client();
  await app.paste("Existing");
  app.run("selectChannel(state.channels[0].id)");
  assert.equal(app.video.src, "https://example.com/Existing.mp4");
  const before = app.video.loadCount;
  app.run("globalThis.destroyed = 0; state.hls = { destroy() { destroyed++; } }");
  app.clear();
  app.clear();
  assert.equal(app.run("destroyed"), 1);
  assert.equal(app.run("state.hls"), null);
  assert.equal(app.run("state.selectedId"), "");
  assert.equal(app.video.src, "");
  assert.equal(app.video.loadCount, before + 2);
  assert.equal(app.elements.get("#nowPlaying").textContent, "Nothing selected");
  assert.equal(app.elements.get("#emptyPlayer").hidden, false);
});

test("playlist replacement stops the prior selection only after successful persistence", async () => {
  const app = client();
  await app.paste("Existing");
  app.run("selectChannel(state.channels[0].id)");
  const pending = app.load("replacement");
  assert.equal(app.video.src, "https://example.com/Existing.mp4");
  finish(app.requests[0], "Replacement");
  await pending;
  assert.equal(app.video.src, "");
  assert.equal(app.run("state.selectedId"), "");
  assert.deepEqual(app.names(), ["Replacement"]);
});

test("failed persistence preserves existing channels, storage and playback", async () => {
  const app = client();
  await app.paste("Existing");
  app.run("selectChannel(state.channels[0].id)");
  const selectedId = app.run("state.selectedId");
  const pauseCount = app.video.pauseCount;
  const loadCount = app.video.loadCount;
  app.run('localStorage.setItem = () => { throw new Error("Storage quota exceeded"); }');
  await assert.rejects(app.paste("Replacement"), /Storage quota exceeded/);
  assert.deepEqual(app.names(), ["Existing"]);
  assert.deepEqual(app.storedNames(), ["Existing"]);
  assert.equal(app.video.src, "https://example.com/Existing.mp4");
  assert.equal(app.video.pauseCount, pauseCount);
  assert.equal(app.video.loadCount, loadCount);
  assert.equal(app.run("state.selectedId"), selectedId);
  assert.equal(app.elements.get("#nowPlaying").textContent, "Existing");
  assert.equal(app.elements.get("#emptyPlayer").hidden, true);
  assert.equal(app.run("state.playlistLoad"), null);
});

test("empty and cleared search shows loaded channels rather than filtering for Untitled", async () => {
  const app = client();
  await app.paste("Existing");
  assert.equal(app.run("state.filtered.length"), 1);
  app.elements.get("#searchInput").value = "missing";
  app.elements.get("#searchInput").events.input();
  assert.equal(app.run("state.filtered.length"), 0);
  app.elements.get("#searchInput").value = "   ";
  app.elements.get("#searchInput").events.input();
  assert.equal(app.run("state.filtered.length"), 1);
});
