# Run the Express showcase

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

Do not commit real credentials. Alternatively set `NODE_CONFIG_DIR` to an absolute private configuration directory. `APP_ENV=stage` selects stage demo behavior and, unless explicitly overridden, also selects node-config’s stage overlay via `NODE_CONFIG_ENV`. The sample environment uses port 3002.

Startup lists local and network URLs. For phone QR testing, open the desktop through the network URL that the phone can reach, and use that same origin for the flow. Do not use `localhost` in the QR: on the phone it refers to the phone. Register the exact callback URL with your provider. Restart the dev server after changing host network interfaces to refresh the printed network addresses.

## Checks and common failures

- Visit `/health/live` for liveness and `/health/ready` for configuration readiness. A ready response does not prove the provider credentials or the full authentication flow work.
- If no QR appears, check browser console/network requests, `/auth/prepare`, `/auth/status` and the reachable origin. The current implementation uses polling, not Socket.IO.
- If callback or token exchange fails, check server/client selection, exact registered redirect URI, scope and provider configuration. Do not replay an authorization code; create a fresh attempt.
- If a phone cannot connect, check the selected LAN address, network routing and host firewall. LAN reachability is separate from successful authentication.

For production, use HTTPS and configure `TRUST_PROXY_HOPS` only for the actual trusted proxy chain. The ingress must overwrite untrusted forwarded headers and direct access must not bypass it. The root Compose file builds the application, mounts its private config read-only and runs a single application container.

## Playwright checks for the main flows

The E2E fixture starts a local mock provider. Install Playwright's Chromium browser, then run a production build before the browser tests:

```bash
npx playwright install chromium
npm run build
E2E_PORT=3103 npm run test:e2e -- e2e/main-flows.spec.ts e2e/qr.spec.ts e2e/sms.spec.ts e2e/result.spec.ts e2e/auth-error.spec.ts
```

The focused suite covers mobile-width PNV IP/IP+, Login IP/IP+, Anonymous Identity, KYC, a provider error, QR, SMS and userinfo display. The fixture does not call the real provider or exercise a physical device, carrier or real OTP. IM and SIM are outside this focused acceptance set; existing separate tests remain available. Use a free `E2E_PORT`; do not set `E2E_REUSE_SERVER` when using the fixture.

## GitHub Actions

The `Showcase Express CI` workflow runs on pushes and pull requests. It installs Node 24.22.0 and Chromium, then runs lint, typecheck, a production build, unit/API tests, integration tests and the full Playwright suite. Failure diagnostics from Playwright are uploaded as a short-lived artifact. The browser fixture starts a mock provider; the workflow requires no stage credentials and does not verify live provider or device behavior. The Docker-specific smoke test runs only when `TEST_DOCKER_IMAGE` is configured.

## Storage limits

Attempts, sessions, rate limits and results are kept in bounded memory in one Node.js process. Restarting clears them; multiple processes or pods do not share state. Use exactly one application instance for this demo.
