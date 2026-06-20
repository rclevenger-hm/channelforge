import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "0.0.0.0";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host}`);
  if (requestUrl.pathname === "/healthz") {
    sendJson(response, 200, { ok: true, service: "ChannelForge" });
    return;
  }
  await serveStatic(requestUrl, response);
}).listen(port, host, () => {
  console.log(`ChannelForge running at http://${host}:${port}/`);
});

async function serveStatic(requestUrl, response) {
  const pathname = requestUrl.pathname === "/" ? "/index.html" : decodeURIComponent(requestUrl.pathname);
  const resolved = normalize(join(root, pathname));
  if (!resolved.startsWith(root)) {
    send(response, 403, "Forbidden");
    return;
  }

  try {
    const body = await readFile(resolved);
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": contentTypes[extname(resolved)] || "application/octet-stream",
    });
    response.end(body);
  } catch {
    send(response, 404, "Not found");
  }
}

function send(response, status, body) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "text/plain; charset=utf-8",
  });
  response.end(body);
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}
