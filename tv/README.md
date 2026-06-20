# TV App Packaging

ChannelForge's public TV packages are web app scaffolds for bring-your-own legal M3U playlists.

Generate TV project folders:

```bash
npm run tv:package
```

Output:

```text
dist-tv/samsung-tizen/
dist-tv/lg-webos/
```

These folders intentionally contain no bundled channels, no provider integrations, no playlist proxy, and no login gate.

## Samsung Tizen

Import `dist-tv/samsung-tizen` into Tizen Studio with the Samsung TV extension installed. Test in the TV emulator and on real developer-mode hardware before store submission.

Samsung store submission normally requires a Samsung developer account, certificates, app metadata, screenshots, privacy/support URLs, and certification testing.

## LG webOS

Package `dist-tv/lg-webos` with the webOS TV CLI or IDE. Test through Developer Mode or the emulator before store submission.

LG store submission normally requires an LG developer account, app metadata, screenshots, privacy/support URLs, and review testing.

## Other TV Platforms

Android TV and Fire TV are good follow-up targets through a WebView or native shell. Roku generally requires a separate BrightScript/SceneGraph implementation. Vizio and VIDAA distribution can be partner-driven and may not be practical for a small public utility app.
