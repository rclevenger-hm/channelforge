import { spawn } from "node:child_process";
import http from "node:http";

const port = 19000 + Math.floor(Math.random() * 1000);
const child = spawn(process.execPath, ["app.js"], {
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

function request(path, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path, method }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function waitForServer() {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const result = await request("/healthz");
      if (result.status === 200) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw lastError || new Error("server did not become ready");
}

function assertSecurityHeaders(result, label) {
  if (result.headers["x-content-type-options"] !== "nosniff") {
    throw new Error(`${label} must send X-Content-Type-Options: nosniff`);
  }
  if (result.headers["referrer-policy"] !== "no-referrer") {
    throw new Error(`${label} must send Referrer-Policy: no-referrer`);
  }
}

try {
  await waitForServer();

  const health = await request("/healthz");
  if (health.status !== 200 || !health.body.includes('"ok":true')) {
    throw new Error(`health endpoint failed: ${health.status} ${health.body}`);
  }
  assertSecurityHeaders(health, "health response");

  const home = await request("/");
  if (home.status !== 200 || !String(home.headers["content-type"]).startsWith("text/html")) {
    throw new Error(`static homepage should be served as HTML: ${home.status}`);
  }
  assertSecurityHeaders(home, "static response");

  const head = await request("/healthz", "HEAD");
  if (head.status !== 200 || head.body !== "") {
    throw new Error(`HEAD health check should be bodyless: ${head.status} ${head.body}`);
  }
  assertSecurityHeaders(head, "HEAD response");

  const post = await request("/healthz", "POST");
  if (post.status !== 405 || post.headers.allow !== "GET, HEAD") {
    throw new Error(`unsupported HTTP method should return 405 with Allow header: ${post.status}`);
  }
  assertSecurityHeaders(post, "method rejection");

  const malformed = await request("/%E0%A4%A");
  if (malformed.status !== 400 || malformed.body !== "Bad request") {
    throw new Error(`malformed path should return 400: ${malformed.status} ${malformed.body}`);
  }
  assertSecurityHeaders(malformed, "bad request response");

  const afterMalformed = await request("/healthz");
  if (afterMalformed.status !== 200) {
    throw new Error("server should remain healthy after a malformed request path");
  }

  const missing = await request("/does-not-exist");
  if (missing.status !== 404) {
    throw new Error(`missing static asset should return 404, got ${missing.status}`);
  }
  assertSecurityHeaders(missing, "not-found response");

  console.log("ChannelForge HTTP boundary checks passed.");
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (child.exitCode !== null) resolve();
    else child.once("exit", resolve);
  });
}
