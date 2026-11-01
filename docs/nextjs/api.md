# Showcase Next.js HTTP reference

[Guide home](README.md) · [Running](running.md)

These paths belong to **the showcase**, not the IPification provider. Unless noted, requests use the showcase origin. Preserve cookies for browser flows. JSON responses may contain provider-dependent fields; do not assume example fields are always present. See the linked route/service code for exact behavior and error handling.

## Browser authentication

| Method and path | Purpose |
| --- | --- |
| `GET /` | Redirect to login |
| `GET /auth/login` | Login, PNV and Identity screen |
| `POST /auth/prepare` | Create an owner-bound attempt; JSON `user_flow`, `server_id`, boolean `qr`, optional `phone`. Returns HTTP 201 with `state`, `url`, `expiresAt` and an HttpOnly owner cookie. |
| `GET /auth/start` | Begin a previously prepared attempt and redirect to authorization; use the returned `url` rather than constructing one. |
| `GET /auth/callback/:userFlow/:serverId` | Provider redirect; consumes callback parameters including `state`, `code`, `error` and `error_description`. |
| `GET /auth/status?state=...` | Owner-bound status polling: `pending`, `completed`, `failed` or `finished`; may include `started`, `expiresAt`, `completionUrl`. |
| `GET /auth/complete?state=...` | Claim a completed attempt and establish its display session. |
| `GET /auth/pending` | Internal waiting page used in applicable IM backchannel flows. |
| `GET /auth/qrcode/complete`, `/auth/qrcode/error` | Phone result pages for QR. |
| `GET /auth/error`, `/auth/login/error`, `/auth/session-required` | Error/session handling pages or redirects. |
| `GET /user/info` | Session-backed result page. |

The login UI uses `/auth/prepare` before `/auth/start`; calling the old start URL without a valid prepared attempt is not equivalent. The QR and IM waiting logic polls status every two seconds; these routes and cookies are demo-specific. [Browser flow](browser-flows.md) · [QR](qr.md) · [Auth handlers](../../src/server/auth/web.ts)

## JSON and operational endpoints

| Method and path | Purpose |
| --- | --- |
| `GET /api/config` | Public configuration; credentials are omitted. |
| `GET /api/geoip` | Approximate country and resolved client IP; default country used on lookup miss. |
| `POST /auth/mobile/login` | Exchange supplied `client_id`, `server_id`, `code` and `redirect_uri`; returns `auth_server` plus userinfo. Does not create a browser session. |
| `POST /auth/s2s/signin` | Read previously cached raw userinfo by `state`; cache miss is an empty 401. This is not a new code exchange. |
| `POST /sms/auth`, `/sms/token` | Start SMS and exchange OTP. See [SMS](sms.md). |
| `POST /ts43/auth`, `/ts43/token` | Start SIM credential request and exchange credential. See [SIM](sim.md). `/ts43/auth` can return 429. |
| `POST /sms/log`, `/ts43/log` | Diagnostic endpoints; not provider integration steps. Avoid sending sensitive information. |
| `GET /health/live` | Process liveness. |
| `GET /health/ready` | Checks runtime configuration and Redis; returns 503 when unavailable. |
| `POST /api/play-integrity/attempt`, `/verify`, `/token-exchange` | Optional Play Integrity flow; full paths share `/api/play-integrity`. Disabled endpoints return 404 unless `PLAY_INTEGRITY_ENABLED=true`. See [Play Integrity](../PLAY_INTEGRITY_IPIFICATION_DEMO.md); verify its deployment assumptions against Next.js code. |

In the SMS and TS43 rows, each second path has the same prefix shown in its first path. `/auth/mobile/login` and `/auth/s2s/signin` preserve demo API contracts; their existence does not establish an authorization policy suitable for arbitrary internet-facing clients. Review access controls and protect sensitive requests in your deployment.

For CIBA responses, a successful start includes `auth_server`, `auth_req_id`, `nonce`, and for SIM `digital_request`. Token success returns `auth_server` and provider userinfo. Failures can return JSON or, for some auth errors, text. Session creation can occur for error data; it does not prove verification. See [handlers](../../src/server/ciba/handlers.ts).
