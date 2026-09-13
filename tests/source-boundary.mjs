import { readFile } from "node:fs/promises";

const html = await readFile("index.html", "utf8");
const client = await readFile("client.js", "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  html.includes('id="playlistUrl" type="url" pattern="https?://.*"'),
  "playlist URL input must constrain user-entered sources to HTTP(S)",
);
assert(
  client.includes('/^https?:\\/\\//i.test(line)'),
  "parsed M3U channel URLs must remain restricted to HTTP(S)",
);
assert(
  !client.includes('file://') && !client.includes('javascript:'),
  "client must not add local-file or executable URL schemes",
);

console.log("ChannelForge playlist source boundary valid.");
