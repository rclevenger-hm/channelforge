# ChannelForge

ChannelForge is a lightweight browser IPTV player for user-provided legal M3U playlists.

This public edition intentionally ships without bundled playlist sources, scraper integrations, provider-specific endpoints, login gates, or stream-discovery tooling. It is meant to be a clean player shell for playlists you own or are authorized to access.

## Run Locally

```powershell
npm start
```

Open:

```text
http://127.0.0.1:5173
```

## Docker

```powershell
docker build -t channelforge .
docker run --rm -p 5173:5173 channelforge
```

## Desktop Apps

ChannelForge can be packaged as a native desktop-style app for Windows, macOS, and Linux using Electron.

Install dependencies:

```powershell
npm install
```

Run the desktop app locally:

```powershell
npm run desktop
```

Build installers on the current platform:

```powershell
npm run dist
```

Platform-specific build scripts are also available:

```powershell
npm run dist:win
npm run dist:mac
npm run dist:linux
```

The public repo includes a GitHub Actions workflow at `.github/workflows/desktop-build.yml` that can build Windows, macOS, and Linux artifacts when manually triggered or when a `v*` tag is pushed.

## TV App Packages

ChannelForge can generate public-safe web app scaffolds for Samsung Tizen TV and LG webOS TV.

Generate the TV project folders:

```powershell
npm run tv:package
```

Output:

```text
dist-tv/samsung-tizen/
dist-tv/lg-webos/
```

These packages reuse the same BYO-playlist app and add TV remote-control focus helpers. They do not include playlists, scrapers, proxy endpoints, provider integrations, or login features.

The public repo includes a GitHub Actions workflow at `.github/workflows/tv-packages.yml` that can generate TV package folders when manually triggered or when a `v*` tag is pushed.

Samsung and LG app store submission still requires their respective developer accounts, certificates/signing, screenshots, privacy/support URLs, and review/certification testing.

## Test

```powershell
npm test
```

## Features

- Load a CORS-accessible M3U playlist URL.
- Paste raw M3U text directly into the app.
- Parse channel name, group, logo, and stream URL from standard `#EXTINF` entries.
- Deduplicate channels by stream URL.
- Search and filter by group.
- Play direct video URLs and HLS streams with HLS.js when needed.
- Store loaded channels and favorites locally in the browser.
- Package as Windows, macOS, and Linux desktop apps with Electron.
- Generate Samsung Tizen and LG webOS TV app scaffolds.

## Legal

ChannelForge does not provide, host, endorse, verify, or redistribute any channels, streams, playlists, or media. Users are responsible for ensuring they have the right to access any playlist or stream they load.

Do not use ChannelForge to access copyrighted, paid, geo-restricted, DRM-protected, or otherwise unauthorized content.
