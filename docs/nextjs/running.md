# Run the Next.js showcase

[Guide home](README.md) · [QR](qr.md)

## Local setup

Use Node.js 24.22.0, npm and provider-issued credentials. From the repository root:

```bash
npm ci
cp config/default.json.sample config/default.json
cp .env.example .env.local
# Configure your auth server and clients in config/default.json.
npm run config:check
APP_ENV=stage npm run dev
```

Do not commit real credentials. Alternatively set `NODE_CONFIG_DIR` to an absolute private configuration directory. `APP_ENV=stage` selects stage demo behavior and is sent as the provider environment; it does not by itself select node-config's stage overlay. Set `NODE_CONFIG_ENV=stage` separately if that overlay is intended. The sample environment uses port 3002.

Startup lists local and network URLs. For phone QR testing, open the desktop through the network URL that the phone can reach, and use that same origin for the flow. Do not use `localhost` in the QR: on the phone it refers to the phone. Register the exact callback URL with your provider. Restart the dev server after changing host network interfaces so its development-origin configuration is refreshed.

## Storage and sessions

The showcase uses a bounded in-process TTL cache for authentication attempts, QR status, results, demo sessions, SIM rate limits and Play Integrity attempts. Run one Node process: state is lost on restart or reload, and separate processes do not share it. A full cache rejects new writes. The `/auth/prepare` and `/auth/status` endpoints are showcase-specific, not IPification API requirements.

For a client application, use its existing session framework and a storage service or database suited to its deployment. Across multiple instances, use shared storage with expiry and atomic claim/consume operations for callbacks and transactions. Secure session cookies, restrict access to stored userinfo, and apply your application's authorization policy. See [auth repositories](../../src/server/auth/repositories.ts), [attempt repository](../../src/server/auth/attempts.ts), and [browser flow](browser-flows.md). The demo memory cache is not a production session implementation.

## Checks and common failures

- Visit `/health/live` for liveness and `/health/ready` for runtime configuration. A ready response does not prove the provider credentials or the full authentication flow work.
- If no QR appears, check browser console/network requests, `/auth/prepare`, `/auth/status` and the reachable origin. The current implementation uses polling, not Socket.IO.
- If callback or token exchange fails, check server/client selection, exact registered redirect URI, scope and provider configuration. Do not replay an authorization code; create a fresh attempt.
- If a phone cannot connect, check the selected LAN address, network routing and host firewall. LAN reachability is separate from successful authentication.

For production, use HTTPS and configure `TRUST_PROXY_HOPS` only for the actual trusted proxy chain. The ingress must overwrite untrusted forwarded headers and direct access must not bypass it. The root Compose file builds the application and mounts its private config read-only.

## Playwright checks for the main flows

The E2E fixture starts a local mock provider. Install Playwright's Chromium browser, then run a production build before the browser tests:

```bash
npm run build
E2E_PORT=3103 npm run test:e2e -- e2e/main-flows.spec.ts e2e/qr.spec.ts e2e/sms.spec.ts e2e/result.spec.ts e2e/auth-error.spec.ts
```

The focused suite covers mobile-width PNV IP/IP+, Login IP/IP+, Anonymous Identity, KYC, a provider error, QR, SMS and userinfo display. The fixture does not call the real provider or exercise a physical device, carrier or real OTP. IM and SIM are outside this focused acceptance set; existing separate tests remain available. Use a free `E2E_PORT`; do not set `E2E_REUSE_SERVER` when using the fixture.

## GitHub Actions

The `Showcase Next.js CI` workflow runs on pushes and pull requests. It installs Node 24.22.0 and Chromium, then runs lint, typecheck, a production build, unit/API tests and the focused Playwright suite above. Failure diagnostics from Playwright are uploaded as a short-lived artifact. The browser fixture starts its own mock provider; the workflow requires no stage credentials and does not verify live provider or device behavior. The separate process integration suite is not part of this workflow.
