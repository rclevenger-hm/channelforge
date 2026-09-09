# Security model

ChannelForge deliberately accepts user-provided playlist and stream URLs. Those inputs should be treated as untrusted even when the user is authorized to view the media.

## Desktop boundary

The Electron shell currently uses:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- no preload bridge
- denial of in-window popups, with HTTP(S) links handed to the operating system browser

Those defaults are security controls, not implementation trivia. Changes that enable Node integration, disable sandboxing/context isolation, or expose privileged IPC to playlist content require explicit threat review and tests.

## Playlist trust

M3U metadata can contain arbitrary channel names, groups, logos, and media URLs. Treat all of it as data:

- never evaluate playlist fields as JavaScript or HTML;
- prefer DOM text properties over HTML injection for labels;
- allow only intended URL schemes for media/logo/external navigation;
- do not send local files, credentials, cookies, or machine identifiers to playlist hosts;
- do not automatically follow provider login flows or execute code supplied by a playlist.

A valid M3U file is not proof that every referenced URL is trustworthy or authorized.

## Web/server boundary

The local web server should remain a static application server rather than a generic URL-fetching proxy. Adding server-side fetch/proxy behavior would introduce SSRF and internal-network access risks and requires explicit allow/deny policy, DNS/IP validation, timeouts, response-size limits, redirect handling, and tests.

## Media behavior

Remote media may fail because of CORS, TLS, codec support, expired tokens, DRM, geo restrictions, or provider policy. Do not work around those failures by disabling browser security controls, forwarding user credentials broadly, or adding an unrestricted proxy.

## Release checklist

Before a desktop/web/TV release:

1. Run the repository test suite.
2. Review Electron `webPreferences` for privilege expansion.
3. Review newly added URL schemes or network endpoints.
4. Confirm no playlist/provider sources or credentials were accidentally bundled.
5. Confirm generated TV packages contain only the public-safe player shell.
6. Exercise malformed playlist entries and unreachable streams; failure should remain contained to the affected channel.
7. Review new dependencies that parse playlists, media, or network content separately from ordinary UI dependencies.

## Future IPC

If native capabilities are later required, expose narrowly scoped preload APIs instead of enabling Node.js in the renderer. Validate arguments in the privileged process and never accept an arbitrary command, filesystem path, or URL-fetch request from renderer content.

## Reporting

Security reports involving privilege escalation in the desktop shell, unsafe URL handling, arbitrary code execution, credential exposure, or unintended local-network access should be disclosed privately to the repository owner before public exploit details are published.
