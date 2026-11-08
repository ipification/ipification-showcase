> Historical migration record: Redis and cross-instance behavior described below were superseded by the single-process memory store. See [current runtime guidance](nextjs/running.md#storage-and-sessions).

# Next.js migration

> Historical reference: the application now lives at the repository root. Use the [current integration guide](nextjs/README.md) for setup and flows.

The new application is developed independently in `showcase-next/`. Express remains the compatibility baseline. No live traffic switches automatically.

For a customer-oriented walkthrough of the running frontend and its authentication requests, read [Authentication flows](NEXTJS_AUTH_FLOWS.md).

## Contract inventory


There are 21 business HTTP method/path pairs, including three optional Play Integrity endpoints:

| Method/path | Next.js destination under `showcase-next/src/app/` |
| --- | --- |
| GET `/` | `route.ts` (302 to `/auth/login`) |
| GET `/auth/login` | `auth/login/page.tsx` |
| GET `/auth/start` | `auth/start/route.ts` |
| GET `/auth/callback/:userFlow/:serverId` | `auth/callback/[userFlow]/[serverId]/route.ts` |
| GET `/auth/complete` | `auth/complete/route.ts` |
| GET `/auth/qrcode/complete` | `auth/qrcode/complete/page.tsx` |
| GET `/auth/qrcode/error` | `auth/qrcode/error/page.tsx` |
| POST `/auth/s2s/signin` | `auth/s2s/signin/route.ts` |
| POST `/auth/mobile/login` | `auth/mobile/login/route.ts` |
| GET `/user/info` | `user/info/page.tsx` |
| GET `/api/geoip` | `api/geoip/route.ts` |
| GET `/api/config` | `api/config/route.ts` |
| POST `/sms/auth`, `/sms/log`, `/sms/token` | `sms/{auth,log,token}/route.ts` |
| POST `/ts43/auth`, `/ts43/log`, `/ts43/token` | `ts43/{auth,log,token}/route.ts` |
| POST `/api/play-integrity/attempt` | `api/play-integrity/attempt/route.ts` |
| POST `/api/play-integrity/verify` | `api/play-integrity/verify/route.ts` |
| POST `/api/play-integrity/token-exchange` | `api/play-integrity/token-exchange/route.ts` |

Preserve required image/icon URLs used by existing config and useful 404 behavior. The new application replaces `/socket.io/` with owner-authenticated `/auth/status` HTTP polling every two seconds. Do not reproduce obsolete JS/CSS library URLs in the new app. Add `/health/live` and `/health/ready` for the new service only. Do not create `page.tsx` and `route.ts` for the same route segment. Use explicit 302 responses for legacy redirect endpoints; Next.js redirect defaults are not interchangeable with Express 302.


## Compatibility ledger


Legacy differences and explicitly approved corrections:

1. QR error page currently checks only string `'false'`, not boolean `false` or missing verification. Web session authentication is not gated on PNV. Preserve demo behavior; integrating applications must apply the stricter rule documented in `docs/PNV.md`.
2. SMS/TS43 token failure still creates an authenticated display session. Keep this behavior visibly documented as demo error display, not a new authorization guarantee.
3. Approved correction (2026-10-31): TS43 `/ts43/token` now sends the same `server_id` as `/ts43/auth`.
4. Approved correction: `/api/config` publishes the default server's complete `redirect_uri` and adds `redirect_uris` keyed by configured server id.
5. Approved correction: web callers first POST `/auth/prepare`. Server-generated state, per-attempt owner/callback cookies and atomic expiring Redis claims (QR: two minutes to scan, then five minutes to complete; direct: five minutes) replace missing/arbitrary-state acceptance. Callback/completion are single-use; QR owners can recover via `/auth/status`, and overlapping IM browser returns wait on `/auth/pending`. Raw S2S cache reads remain non-consuming. This changes the web protocol intentionally; retain preparation cookies and follow its returned URL.
6. `env` currently depends on `NODE_ENV`. Moving the same deployment label to `APP_ENV` is a required compatibility adaptation, and must be tested in stage.

Malformed HTTP 200 token responses now fail at the token step before userinfo (`TOKEN_RESPONSE_INVALID`). No provider call retries or broad timeout changes are introduced. Preserve best-effort CIBA callback behavior. Legacy request-body acceptance includes JSON and urlencoded for existing non-Integrity endpoints; duplicate/malformed query/body cases need characterization. Play Integrity keeps its dedicated 16 KB bound and safe 400 responses even when Content-Length is absent. Keep security headers compatible with consent iframe, browser credential APIs and required external assets. Log request ID, method/path without query secrets, status and duration; do not copy credential/token/PII debug dumps into the new service. Logging redaction and safe React rendering are explicit migration adaptations.


## Validation

Run the legacy suite with Node 24.22.0 using `npm test`. Local provider stubs are not evidence of hosted or real-device success.

## New application

`showcase-next/` owns React pages, HTTP Route Handlers and a custom Node entrypoint. It does not import the parent Express application. The UI uses shadcn/ui and Tailwind; QR and IM read authentication status through HTTP polling every two seconds; Socket.IO is removed. Redis stores opaque sessions, one-hour auth results, rate counters and atomic Integrity attempts/transactions.

### Local setup

Use Node **24.22.0** and a disposable local Redis instance. Keep the legacy application on its original port; Next defaults to **3002**.

```bash
cd showcase-next
npm ci
cp config/default.json.sample config/default.json
cp .env.example .env.local
# Fill in credentials in config/default.json and set REDIS_URL in .env.local.
npm run config:check
npm run dev
```

Development startup prints `Local` and `Network` login URLs for the actual port. For phone QR authentication, open a Network URL on the computer and put the phone on the same reachable network. A QR containing localhost points to the phone itself. If several interfaces exist, all noninternal IPv4 addresses are listed; choose the one reachable from the phone. No LAN address produces a connect-and-restart hint.

Alternatively, explicitly set `NODE_CONFIG_DIR` to the absolute existing private `config/` directory. The new app does not implicitly search the parent folder or load the parent's `.env`. The existing JSON schema, root/per-flow credential fallbacks, locale and app_config overrides remain supported. Configuration is server-only; public DTOs omit credentials. Arrays in node-config overlays replace the complete inherited array.

`NODE_ENV` is development/test/production. Use `APP_ENV=stage` for demo behavior and provider `env`, and `NODE_CONFIG_ENV=stage` for node-config stage overlays. Origin is always detected per request in development and production. For direct access, the app uses the request host/protocol. Behind a single trusted Kubernetes ingress, set `TRUST_PROXY_HOPS=1` so `X-Forwarded-Host` and `X-Forwarded-Proto` supply the public domain and HTTPS protocol. No app domain allowlist is required; ingress controls which domains route here. Register each public callback URL used with the provider. Play Integrity verification uses the trusted incoming hostname separately.

The new session cookie is `showcase_next_sid`: a random opaque ID, HttpOnly, SameSite=Lax, host-only, one-hour absolute expiry and Secure on HTTPS. Redis data never goes into this cookie. Existing Express sessions are not imported.

### Production build and Docker

```bash
cd showcase-next
npm run build
npm start
```

The build requires no private JSON, Redis or provider credentials. Configure them at runtime before start. This application uses a custom server, not `next start` or Next standalone output.

From the repository root:

```bash
docker compose -f docker-compose.next.yml build
docker compose -f docker-compose.next.yml up -d
```

The opt-in Compose file leaves the existing stack unchanged. It mounts root `config/default.json` read-only at `/run/showcase-config/default.json` and starts its own Redis volume. Redis is published only on loopback port 6380. Set `SHOWCASE_APP_ENV` and `SHOWCASE_TRUST_PROXY_HOPS` explicitly for deployment. An HTTPS reverse proxy must sanitize incoming forwarded headers, set correct host/protocol/client-IP headers. Prevent clients from bypassing a trusted proxy. App replicas share attempts/results through Redis, so authentication polling needs no sticky affinity, WebSocket upgrade or pub/sub adapter.

`GET /health/live` checks the HTTP process; `/health/ready` checks runtime config, enabled-feature settings, Redis availability. Redis failures do not fall back to memory. The container runs as the node user, which must have read permission for mounted configuration/credential files.

To change private JSON, pre-validate a candidate mount with `npm run config:check`, replace the file, and recreate all app containers:

```bash
docker compose -f docker-compose.next.yml up -d --force-recreate showcase-next
```

No image rebuild is needed. Recreate is important for single-file bind mounts after atomic host-file replacement. Play Integrity snapshots can retain prior credentials for their remaining 120-second lifetime. Google credentials and PLAY_INTEGRITY_* settings remain runtime-only and are not enabled in the sample Compose stack; add them through an operator-owned override and secret mount when needed.

### Verification commands

```bash
# Root: legacy characterization suite only
npm test

# showcase-next/: unit/HTTP contracts, Redis/process integration, browser UI
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
npx playwright install chromium
npm run test:e2e
```

Redis integration tests launch their own disposable local `redis-server`; never point them at a deployed store. Browser tests use fake local providers and a temporary configuration directory; they do not read private configuration. TS43 browser credentials and WebOTP are stubbed where needed; this is not real-device evidence.

### Polling-only local verification (2026-10-31)

The current application checks `/auth/status` immediately and every 2000 ms for QR and IM. Socket.IO client/server, notifier, Redis adapter/emitter and their dependencies have been removed. Configuration and Redis determine readiness; no authentication WebSocket or sticky affinity is required.

Node 24.22.0: ESLint, TypeScript and production build passed; 66 unit/API tests, 6 process/Redis integration tests and 43 Chromium scenarios passed in an isolated local fixture. The optional Docker smoke test was skipped. Coverage includes HTTP-only two-browser QR completion, status failure recovery, no socket traffic, expiry/refresh/close, callback on another replica, owner-cookie rejection, sessions after restart and Redis outage. A fresh source review found no material issues. Real providers, mobile devices and the deployed ingress remain external acceptance boundaries.

### Historical local acceptance evidence (2026-10-28)

The socket transport checks below describe the earlier implementation. The current polling-only application removes that transport and its dependencies; see [authentication status polling](NEXTJS_AUTH_FLOWS.md#provider-deadlines-and-status-recovery).

The implementation is on branch `migration/nextjs`, based on `0db9ad1`, in `/private/tmp/ipification-showcase-nextjs`. Checked with Node 24.22.0:

- Legacy suite: 109 passed.
- Next unit/HTTP contracts: 18 passed across 13 files. The parity fixture exercises all 21 existing method/path contracts, plus malformed/oversize JSON on eight general POST endpoints. This is fixture coverage, not exhaustive provider/input equivalence.
- Redis/process integration: 8 passed; the optional Docker test was run separately and passed (9 total). This includes callbacks across production processes, session/result reads after app restart, cross-process Integrity claim/exchange races, Redis outage, fixed TTL storage, Socket.IO polling/WebSocket room delivery, and shared rate counters.
- Chromium: 13 passed, including two-browser QR, SMS retries/cancellation, WebOTP cancellation, TS43 credential stubs, storage failures and mobile layout.
- ESLint, TypeScript, production build and final Docker image build passed. Docker smoke verified non-root execution, no baked private JSON, and runtime configuration changes after container recreation.

Regression fixes from the final review pass:

- Untrusted forwarded headers are removed before Next creates its request URL; `TRUST_PROXY_HOPS=0` now ignores a spoofed protocol as well as forwarded hostname/IP. Actual HTTP tests cover trust off/on, including a forged internal peer-IP header.
- General malformed/oversize request bodies retain legacy HTTP 500 (the Express error middleware maps parser errors to 500). The new response is safe JSON rather than a framework error page. Integrity keeps its separate HTTP 400 safe-error contract.

The independent reviewer stopped before issuing a complete report because its usage limit was reached. Its confirmed proxy finding was reproduced and fixed with RED/GREEN tests; the author checked malformed-input behavior and added the process-boundary tests above. A complete independent branch review remains outstanding. Do not interpret local test success as staging or production acceptance.

Still pending: actual provider IP/IP+/IM and SMS flows, Android TS43/WebOTP support, Google Play Integrity verification, exact staging proxy topology and public callbacks, multi-replica HTTP polling through the actual ingress, and a rehearsed cutover/rollback. The implementation does not switch traffic or remove Express.

### Cutover and rollback

1. Verify all current flows against the exact staging public origin, provider client/callback registrations and supported devices. Include real IP/IP+/IM, QR on two devices, S2S/mobile APIs, SMS, TS43 and both Integrity verify/bypass hosts.
2. Stop new legacy starts, drain outstanding callbacks/QR sessions, and wait at least the 120-second Integrity TTL. Do not infer drained external flows from cache expiry alone.
3. Switch all auth paths, including `/auth/prepare`, `/auth/status` and `/auth/complete`, to the new application together. Users must log in again; keep the prior image/config available.
4. Roll back all authentication routes to Express if needed. New sessions are not valid in Express. Do not delete legacy source or Redis data as part of rollback.

No production traffic switch, push or legacy removal is performed by this implementation.

### Callback error screens

Browser callback failures now redirect to `/auth/error` instead of returning the raw Axios message. The page explains the problem, gives recovery instructions, and includes an expandable diagnostic section plus a support reference. `invalid_client`/`unauthorized_client` indicate client authentication failure; `invalid_grant` indicates a rejected code (possibly expiry/reuse or client/redirect mismatch). An unqualified token 401 remains `TOKEN_REJECTED`: it does not prove a bad secret. Userinfo failures and unreachable/5xx providers have separate messages.

The callback logs one `auth_callback_failed` JSON event containing the reference, classification, step, upstream HTTP status, and an allowlisted OAuth error code. It does not log Axios config, provider response descriptions, codes, credentials or tokens. Browser redirects include only these safe diagnostic fields. Unexpected query values are ignored by the rendered diagnostic section. Do not add raw provider descriptions to this page or URL.

Backchannel failures remain HTTP 400 and now return safe JSON `{ error, reference }`; successful callbacks/backchannels and session completion are unchanged. Existing login error-query handling is unchanged. QR failure screens apply to the device opening the callback; an already-open desktop QR dialog still waits for successful completion.

Verification: production build, lint/typecheck, 14 unit/HTTP tests (including existing unit tests), and all 14 Chromium scenarios passed. The new contract fixture covers five provider failure classes, backchannel failure, redaction and successful callback/session completion using disposable Redis and a local provider. No real-provider code was replayed. Use `E2E_PORT=3003 npm run test:e2e` to test while a developer server is using port 3002.

### Showcase tab presentation

PNV, Login and Identity use a scoped segmented navigation style with decorative icons, 48px minimum target height, a primary-color selected tab with white text and icons, and a neutral navigation background. Focus remains visible, reduced-motion preferences disable transitions, and decorative icons are hidden below 360px to preserve label space. Tab filtering, accessible labels, hash navigation and stored selection are unchanged. Existing navigation/storage tests and desktop/mobile visual checks passed (3 Chromium scenarios), along with production build, lint and typecheck.

### Mobile interaction in the development preview

The custom dev server binds to `0.0.0.0`. Next's dev-resource origin guard therefore needs an explicit allowlist for browsers opening the preview through an IP. Without it, the HMR handshake is blocked and the page can stay unhydrated: neither tab selection nor content responds. `next.config.ts` allows loopback and exact IPv4 addresses from the host's network interfaces. Arbitrary external origins remain blocked. Restart `npm run dev` after config or network-interface changes. This setting applies to Next development resources.

A touch regression switches Login, Identity and PNV and checks selection, URL hash and visible section headings. To run it against an already-running preview (without starting a fixture server), use `E2E_REUSE_SERVER=1 npm run test:e2e -- e2e/login.spec.ts -g 'touch users'`. The dev HTTP contract also verifies successful HMR upgrades for local IP origins and rejection of an unrelated origin. The reported failure was reproduced through IP access, then the touch test passed after the allowlist and restart; Android Chrome emulation also passed through the machine's LAN address. These are Chromium emulation checks, not physical-device evidence.

### Authentication button presentation

Flow buttons use equal outlined rows with a method icon, consistent spacing and a directional chevron. Enabled choices have white backgrounds, dark labels and primary-color icon badges; hover/pressed states add a light primary tint. Disabled choices have a neutral surface and legible labels. Solid primary styling is retained for dialog confirmation actions. Shared buttons use 44px default height, with 58px minimum flow rows and reduced-motion support. Authentication handlers, labels and enable/disable conditions are unchanged. Production build, lint/typecheck and all 15 Chromium scenarios passed after the styling change.

The header reuses the legacy IP logo at `/images/logo.ico` by default. A configured `app_logo_url` (with `app_logo_style`) takes precedence and is displayed in the header rather than duplicated in the hero section.
