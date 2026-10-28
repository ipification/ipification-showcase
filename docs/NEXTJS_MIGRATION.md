# Next.js migration

The new application is developed independently in `showcase-next/`. Express remains the compatibility baseline. No live traffic switches automatically.

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

Also preserve `/socket.io/` transport behavior, required image/icon URLs used by existing config, and useful 404 behavior. Do not reproduce obsolete JS/CSS library URLs in the new app. Add `/health/live` and `/health/ready` for the new service only. Do not create `page.tsx` and `route.ts` for the same route segment. Use explicit 302 responses for legacy redirect endpoints; Next.js redirect defaults are not interchangeable with Express 302.


## Compatibility ledger


Characterize these before migration; do not silently correct them:

1. QR error page currently checks only string `'false'`, not boolean `false` or missing verification. Web session authentication is not gated on PNV. Preserve demo behavior; integrating applications must apply the stricter rule documented in `docs/PNV.md`.
2. SMS/TS43 token failure still creates an authenticated display session. Keep this behavior visibly documented as demo error display, not a new authorization guarantee.
3. TS43 frontend omits `server_id` in `/ts43/token` despite sending it to `/ts43/auth`; characterize the mismatch. Baseline migration preserves it until an explicit behavior-fix decision is approved.
4. `/api/config` publishes callback URLs without server ID, while actual web auth uses both path parameters. Preserve public response shape/value unless a separate correction is approved; new UI builds authorization via `/auth/start`, not this field.
5. Missing callback state generates a UUID; start only checks presence; cached results are not consumed. OAuth state hardening is separate scope.
6. `env` currently depends on `NODE_ENV`. Moving the same deployment label to `APP_ENV` is a required compatibility adaptation, and must be tested in stage.

No provider call retries or broad timeout changes are introduced. Preserve best-effort CIBA callback behavior. Legacy request-body acceptance includes JSON and urlencoded for existing non-Integrity endpoints; duplicate/malformed query/body cases need characterization. Play Integrity keeps its dedicated 16 KB bound and safe 400 responses even when Content-Length is absent. Keep security headers compatible with consent iframe, browser credential APIs and required external assets. Log request ID, method/path without query secrets, status and duration; do not copy credential/token/PII debug dumps into the new service. Logging redaction and safe React rendering are explicit migration adaptations.


## Validation

Run the legacy suite with Node 24.22.0 using `npm test`. Local provider stubs are not evidence of hosted or real-device success.

## New application

`showcase-next/` owns React pages, HTTP Route Handlers and a custom Node entrypoint. It does not import the parent Express application. The UI uses shadcn/ui and Tailwind; Socket.IO retains the QR room/event protocol. Redis stores opaque sessions, one-hour auth results, rate counters and atomic Integrity attempts/transactions.

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

Alternatively, explicitly set `NODE_CONFIG_DIR` to the absolute existing private `config/` directory. The new app does not implicitly search the parent folder or load the parent's `.env`. The existing JSON schema, root/per-flow credential fallbacks, locale and app_config overrides remain supported. Configuration is server-only; public DTOs omit credentials. Arrays in node-config overlays replace the complete inherited array.

`NODE_ENV` is development/test/production. Use `APP_ENV=stage` for demo behavior and provider `env`, and `NODE_CONFIG_ENV=stage` for node-config stage overlays. One canonical browser origin per deployment is proposed: set `APP_ORIGIN` to the exact public scheme/host/port registered with the provider. Play Integrity verification uses the trusted incoming hostname separately.

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
SHOWCASE_APP_ORIGIN=https://showcase.example.com \
  docker compose -f docker-compose.next.yml up -d
```

The opt-in Compose file leaves the existing stack unchanged. It mounts root `config/default.json` read-only at `/run/showcase-config/default.json` and starts its own Redis volume. Redis is published only on loopback port 6380. Set `SHOWCASE_APP_ENV` and `SHOWCASE_TRUST_PROXY_HOPS` explicitly for deployment. An HTTPS reverse proxy must sanitize incoming forwarded headers, set correct host/protocol/client-IP headers, and support WebSocket upgrade. Prevent clients from bypassing a trusted proxy. Multiple app replicas retaining Socket.IO polling need sticky affinity **and** the Redis adapter. Pub/sub notifications are not durable.

`GET /health/live` checks the HTTP process; `/health/ready` checks runtime config, enabled-feature settings, Redis and socket readiness. Redis failures do not fall back to memory. The container runs as the node user, which must have read permission for mounted configuration/credential files.

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

### Cutover and rollback

1. Verify all current flows against the exact staging public origin, provider client/callback registrations and supported devices. Include real IP/IP+/IM, QR on two devices, S2S/mobile APIs, SMS, TS43 and both Integrity verify/bypass hosts.
2. Stop new legacy starts, drain outstanding callbacks/QR sessions, and wait at least the 120-second Integrity TTL. Do not infer drained external flows from cache expiry alone.
3. Switch all auth paths and `/socket.io/` to the new application together. Users must log in again; keep the prior image/config available.
4. Roll back the complete route/socket owner to Express if needed. New sessions are not valid in Express. Do not delete legacy source or Redis data as part of rollback.

No production traffic switch, push or legacy removal is performed by this implementation.
