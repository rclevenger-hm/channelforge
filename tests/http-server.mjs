import { spawn } from "node:child_process";
import http from "node:http";

const port = 19000 + Math.floor(Math.random() * 1000);
const child = spawn(process.execPath, ["app.js"], {
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

function request(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path, method: "GET" }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body }));
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

try {
  await waitForServer();

  const health = await request("/healthz");
  if (health.status !== 200 || !health.body.includes('"ok":true')) {
    throw new Error(`health endpoint failed: ${health.status} ${health.body}`);
  }

  const malformed = await request("/%E0%A4%A");
  if (malformed.status !== 400 || malformed.body !== "Bad request") {
    throw new Error(`malformed path should return 400: ${malformed.status} ${malformed.body}`);
  }

  const afterMalformed = await request("/healthz");
  if (afterMalformed.status !== 200) {
    throw new Error("server should remain healthy after a malformed request path");
  }

  const missing = await request("/does-not-exist");
  if (missing.status !== 404) {
    throw new Error(`missing static asset should return 404, got ${missing.status}`);
  }

  console.log("ChannelForge HTTP boundary checks passed.");
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (child.exitCode !== null) resolve();
    else child.once("exit", resolve);
  });
}
