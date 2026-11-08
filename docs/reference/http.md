# Showcase HTTP reference

[Documentation home](../README.md) · [Source map](source-map.md)

All paths below belong to the showcase origin. They are not IPification provider API endpoints. Browser flows use same-origin cookies; responses and claim fields depend on provider and configuration.

## Browser routes

| Method and path | Behavior |
| --- | --- |
| `GET /` | Redirect to login. |
| `GET /auth/login` | Showcase UI. |
| `POST /auth/prepare` | Create an owner-bound attempt from JSON `user_flow`, `server_id`, boolean `qr` and optional `phone`. Returns HTTP 201 with `state`, `url`, `expiresAt` and owner cookie. |
| `GET /auth/start` | Start a prepared attempt. Follow the returned URL instead of constructing one. |
| `GET /auth/callback/:userFlow/:serverId` | Bound provider callback with state and code or error. |
| `GET /auth/status?state=...` | Owner-bound status (`pending`, `completed`, `failed` or `finished`) and, when applicable, `started`, `expiresAt`, `completionUrl`. |
| `GET /auth/complete?state=...` | Claim a finished attempt and create the demo display session. |
| `GET /auth/pending` | Waiting page for applicable IM backchannel overlaps. |
| `GET /auth/qrcode/complete`, `/auth/qrcode/error` | Phone-side QR result pages. |
| `GET /auth/error`, `/auth/login/error`, `/auth/session-required` | Demo error or session-handling endpoints. |
| `GET /user/info` | Session-backed demo result page. |

[Browser flow](../integration/browser.md) · [QR](../integration/qr.md) · [Handlers](../../src/server/auth/web.ts)

## API and operations

| Method and path | Behavior |
| --- | --- |
| `GET /api/config` | Public configuration; client secrets are omitted. |
| `GET /api/geoip` | Approximate location using resolved client IP, with configured fallback. |
| `POST /auth/mobile/login` | Exchange an authorization code and fetch userinfo; no browser session. |
| `POST /auth/s2s/signin` | Read existing raw userinfo by state; cache miss returns empty 401. |
| `POST /sms/auth`, `POST /sms/token` | Start and complete SMS CIBA. |
| `POST /ts43/auth`, `POST /ts43/token` | Start and complete SIM CIBA; start may return 429. |
| `POST /sms/log`, `POST /ts43/log` | Demo diagnostics, not provider integration steps. |
| `GET /health/live` | Process liveness. |
| `GET /health/ready` | Runtime configuration readiness, not provider availability. |
| `POST /api/play-integrity/attempt`, `/api/play-integrity/verify`, `/api/play-integrity/token-exchange` | Optional Android flow; disabled endpoints return 404. |

Mobile and S2S contracts are detailed [here](../integration/mobile-s2s.md); see [SMS](../integration/sms.md), [SIM](../integration/sim.md), and [Play Integrity](../integration/play-integrity.md) for inputs and failure boundaries. Client/session access policies in this demo are not a general authorization design for an internet-facing application.
