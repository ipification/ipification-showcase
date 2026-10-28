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
