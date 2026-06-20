import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const files = {
  html: await readFile("index.html", "utf8"),
  readme: await readFile("README.md", "utf8"),
  server: await readFile("app.js", "utf8"),
  client: await readFile("client.js", "utf8"),
  packageJson: JSON.parse(await readFile("package.json", "utf8")),
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(files.html.includes("client.js"), "index should load client.js");
assert(files.packageJson.scripts?.start === "node app.js", "start script should run the server entry");
assert(files.server.includes("/healthz"), "server should expose health endpoint");
assert(files.client.includes("playlistUrl"), "client should support user-provided playlist URLs");
assert(files.client.includes("playlistText"), "client should support pasted M3U text");
assert(files.client.includes("parseM3u"), "client should parse M3U text");
assert(files.client.includes("Hls"), "client should use HLS.js for HLS playback");
assert(files.readme.includes("without bundled playlist sources"), "README should describe public-safe source policy");

for (const forbidden of ["NasiLemakk", "BuddyChewChew", "apsattv", "Tubi", "Xtream", "FastChannels", "CHANNELFORGE_TOTP_SECRET", "CHANNELFORGE_PASSWORD", "/playlist", "/metadata", "/tubi"]) {
  assert(!files.client.includes(forbidden), `client should not include private feature/reference: ${forbidden}`);
  assert(!files.server.includes(forbidden), `server should not include private feature/reference: ${forbidden}`);
}

assert(!existsSync("server.mjs"), "public edition should not include private server.mjs");
assert(!existsSync("deploy/hostinger-node.env.example"), "public edition should not include private deployment env templates");

console.log("ChannelForge public-safe smoke checks passed.");
