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
  client.includes('logo: safeHttpUrl(attrs["tvg-logo"] || "")'),
  "playlist-provided logo URLs must pass through the HTTP(S) scheme boundary",
);
assert(
  client.includes('url.protocol !== "http:" && url.protocol !== "https:"'),
  "logo URL normalization must reject non-HTTP(S) schemes",
);
assert(
  client.includes("PLAYLIST_FETCH_TIMEOUT_MS") && client.includes("AbortController"),
  "remote playlist retrieval must have an abortable timeout boundary",
);
assert(
  client.includes("MAX_PLAYLIST_BYTES") && client.includes('response.headers.get("content-length")'),
  "remote playlist retrieval must reject oversized declared responses",
);
assert(
  client.includes("response.body.getReader()") && client.includes("bytesRead > MAX_PLAYLIST_BYTES"),
  "remote playlist retrieval must enforce the size limit while streaming unknown-length responses",
);
assert(
  client.includes("await reader.cancel()"),
  "oversized streaming responses must be cancelled instead of continuing to download",
);
assert(
  !client.includes('file://') && !client.includes('javascript:'),
  "client must not add local-file or executable URL schemes",
);

console.log("ChannelForge playlist source boundary valid.");
