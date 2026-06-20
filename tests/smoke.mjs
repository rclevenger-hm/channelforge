import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const files = {
  desktopWorkflow: await readFile(".github/workflows/desktop-build.yml", "utf8"),
  electronMain: await readFile("electron/main.cjs", "utf8"),
  html: await readFile("index.html", "utf8"),
  readme: await readFile("README.md", "utf8"),
  server: await readFile("app.js", "utf8"),
  client: await readFile("client.js", "utf8"),
  tvBuilder: await readFile("scripts/build-tv-packages.mjs", "utf8"),
  tvCss: await readFile("tv/tv.css", "utf8"),
  tvReadme: await readFile("tv/README.md", "utf8"),
  tvRemote: await readFile("tv/tv-remote.js", "utf8"),
  tvWorkflow: await readFile(".github/workflows/tv-packages.yml", "utf8"),
  packageJson: JSON.parse(await readFile("package.json", "utf8")),
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(files.html.includes("client.js"), "index should load client.js");
assert(files.packageJson.scripts?.start === "node app.js", "start script should run the server entry");
assert(files.packageJson.scripts?.desktop === "electron .", "desktop script should run Electron");
assert(files.packageJson.scripts?.dist === "electron-builder --publish never", "dist script should package desktop builds without publishing");
assert(files.packageJson.scripts?.["dist:linux"]?.includes("--publish never"), "Linux desktop build should not publish from electron-builder");
assert(files.packageJson.scripts?.["dist:mac"]?.includes("--publish never"), "macOS desktop build should not publish from electron-builder");
assert(files.packageJson.scripts?.["dist:win"]?.includes("--publish never"), "Windows desktop build should not publish from electron-builder");
assert(files.packageJson.scripts?.["tv:package"] === "node scripts/build-tv-packages.mjs", "tv package script should generate TV app folders");
assert(files.packageJson.devDependencies?.electron, "Electron should be available for desktop app builds");
assert(files.packageJson.devDependencies?.["electron-builder"], "electron-builder should be available for installers");
assert(files.packageJson.main === "electron/main.cjs", "package main should point to Electron entry");
assert(files.server.includes("/healthz"), "server should expose health endpoint");
assert(files.electronMain.includes("BrowserWindow"), "Electron entry should create a desktop window");
assert(files.electronMain.includes("nodeIntegration: false"), "Electron entry should disable nodeIntegration");
assert(files.desktopWorkflow.includes("windows-latest") && files.desktopWorkflow.includes("macos-latest"), "desktop workflow should build Windows and macOS artifacts");
assert(files.desktopWorkflow.includes("branches:") && files.desktopWorkflow.includes("- main"), "desktop workflow should run on main pushes");
assert(files.desktopWorkflow.includes("GH_TOKEN: ${{ github.token }}"), "desktop workflow should pass the built-in token to Electron Builder");
assert(files.desktopWorkflow.includes("release-assets/*.AppImage") && files.desktopWorkflow.includes("release-assets/*.dmg"), "desktop release workflow should upload installer package globs");
assert(files.tvBuilder.includes("samsung-tizen") && files.tvBuilder.includes("lg-webos"), "TV builder should generate Samsung and LG packages");
assert(files.tvRemote.includes("ArrowRight") && files.tvRemote.includes("ArrowDown"), "TV remote helper should support directional navigation");
assert(files.tvCss.includes(".tv-runtime"), "TV CSS should include TV runtime focus styling");
assert(files.tvWorkflow.includes("npm run tv:package"), "TV workflow should generate TV packages");
assert(files.tvWorkflow.includes("branches:") && files.tvWorkflow.includes("- main"), "TV workflow should run on main pushes");
assert(files.tvReadme.includes("Samsung Tizen") && files.tvReadme.includes("LG webOS"), "TV README should document Samsung and LG targets");
assert(files.client.includes("playlistUrl"), "client should support user-provided playlist URLs");
assert(files.client.includes("playlistText"), "client should support pasted M3U text");
assert(files.client.includes("parseM3u"), "client should parse M3U text");
assert(files.client.includes("Hls"), "client should use HLS.js for HLS playback");
assert(files.readme.includes("without bundled playlist sources"), "README should describe public-safe source policy");
assert(files.readme.includes("Desktop Apps"), "README should document desktop app packaging");
assert(files.readme.includes("TV App Packages"), "README should document TV app packaging");

for (const forbidden of ["NasiLemakk", "BuddyChewChew", "apsattv", "Tubi", "Xtream", "FastChannels", "CHANNELFORGE_TOTP_SECRET", "CHANNELFORGE_PASSWORD", "/playlist", "/metadata", "/tubi"]) {
  assert(!files.client.includes(forbidden), `client should not include private feature/reference: ${forbidden}`);
  assert(!files.server.includes(forbidden), `server should not include private feature/reference: ${forbidden}`);
}

assert(!existsSync("server.mjs"), "public edition should not include private server.mjs");
assert(!existsSync("deploy/hostinger-node.env.example"), "public edition should not include private deployment env templates");

console.log("ChannelForge public-safe smoke checks passed.");
