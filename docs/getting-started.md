# Run the showcase

[Documentation home](README.md) · [Choose a flow](README.md#ipification-showcase-documentation)

## Prerequisites

- Node.js and npm; check the exact Node version in the `engines` field of [package.json](../package.json). The repository's `.tool-versions` and CI currently specify Node 24.22.0.
- IPification-issued server URL, client ID and secret, permitted scope and product, and registered callback URL. The sample contains placeholders; it is not a working credential set.
- For QR, a desktop and phone able to reach the same showcase origin, plus an eligible mobile connection/provider setup.

From the repository root:

```sh
npm ci
cp config/default.json.sample config/default.json
cp .env.example .env.local
# Configure auth_servers, realm, client_id, client_secret and permitted clients in config/default.json.
npm run config:check
npm run dev
```

Open the local URL printed at startup. Select a configured server and flow in the UI. For phone QR, open the Network URL on the desktop and ensure the phone can reach that exact host. `localhost` on a phone refers to the phone itself. Register the callback for the origin and server in use; browser flows construct `{origin}/auth/callback/{userFlow}/{serverId}`.

Do not commit credentials. A private configuration directory can be supplied via `NODE_CONFIG_DIR`. `APP_ENV=stage` sets demo/provider environment behavior; it does not alone choose the node-config stage overlay. Set `NODE_CONFIG_ENV=stage` separately when the overlay is intended. Restart after changing configuration or host network interfaces. See [runtime configuration](../runtime/config.mjs) and [sample configuration](../config/default.json.sample).

## Docker Compose

After configuring `config/default.json`, run `docker compose up --build`. Compose mounts that file read-only and exposes port 3002. Use HTTPS for deployed environments and set `TRUST_PROXY_HOPS` only for your actual proxy chain. The trusted ingress must overwrite forwarded headers and direct access must not bypass it. See [Compose](../docker-compose.yml) and [request context](../src/server/http/context.ts).

## Local state and health

The demo keeps attempts, results, display sessions, rate counters and integrity transactions in a bounded in-process TTL cache. Run **one server process**: instances do not share data, and a restart clears sessions and in-progress attempts. Capacity exhaustion rejects new writes. For a multi-instance client application, use its existing shared session/store or database with expiration and atomic claim/consume semantics. See [memory store](../src/server/store/memory.ts) and [repositories](../src/server/auth/repositories.ts).

`GET /health/live` checks process liveness; `GET /health/ready` checks configuration. Neither proves that provider credentials, the carrier or an end-to-end flow work. For failures, inspect the selected server and client, registered callback, request response, reachable origin and provider configuration. Do not reuse an expired or already exchanged authorization code.

## Verification

```sh
npm run lint
npm run typecheck
npm run build
npm test
npm run test:integration
E2E_PORT=3103 npm run test:e2e -- e2e/main-flows.spec.ts e2e/qr.spec.ts e2e/sms.spec.ts e2e/result.spec.ts e2e/auth-error.spec.ts
```

The focused Playwright suite needs Chromium (`npx playwright install chromium`) and a production build. It uses a mock provider, not live credentials, a physical device, a carrier or real OTP. The optional Docker integration test requires a configured image. See [workflow](../.github/workflows/showcase-next-ci.yml) for what hosted CI runs; local results do not establish hosted CI or deployment status.
