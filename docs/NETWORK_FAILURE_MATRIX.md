# Playlist network failure matrix

Remote M3U retrieval is an external reliability boundary. The client already limits request duration and response size; this matrix defines the behaviors that should stay covered as the player evolves.

| Failure | Expected behavior |
| --- | --- |
| DNS/connect failure | Report a bounded load failure; keep the current UI usable. |
| Request timeout | Abort the request and surface a retryable error. |
| HTTP 4xx | Do not retry automatically unless a future policy explicitly identifies a safe status. |
| HTTP 5xx | Fail cleanly; any future retry must be bounded and cancellable. |
| Oversized `Content-Length` | Reject before consuming the body. |
| Streaming body exceeds the byte limit | Cancel the reader as soon as the limit is crossed. |
| Partial/truncated response | Reject parsing without replacing a previously usable playlist with partial state. |
| Redirect to non-HTTP(S) URL | Reject at the source boundary. |
| Malformed M3U rows | Ignore or report malformed entries without executing embedded content. |

## Test priorities

The next automated network tests should use a local HTTP server so CI remains deterministic. Cover delayed responses, a chunked body that crosses the limit, a truncated connection, redirect handling, and recovery with a subsequent valid playlist.

The test harness must not depend on a public IPTV endpoint.

## Operational rule

Network failures should be diagnosable without exposing user playlist URLs in logs or telemetry. If richer diagnostics are added, log failure category, status code where available, elapsed time, and bytes read rather than the full source URL.
