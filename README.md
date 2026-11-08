# IPification Showcase

A Next.js demo for trying IPification phone number verification, login and identity flows. Use the UI to explore a flow, then follow the [integration guide](docs/README.md) to understand the requests and source code.

## Run locally

You need Node.js, npm, and IPification-issued credentials, enabled scopes and registered callback URLs. The repository's `.tool-versions` and CI specify Node **24.22.0**; check `package.json` for the engine configured in your checkout.

```bash
npm ci
cp config/default.json.sample config/default.json
cp .env.example .env.local
# Configure the auth server, realm, client credentials and enabled flows in config/default.json.
npm run config:check
npm run dev
```

Open the local URL printed by the server. For desktop QR testing, open the printed Network URL on the desktop and use a phone that can reach that same origin. Register the actual callback URL with your provider. See [local setup and troubleshooting](docs/getting-started.md) for configuration details.

To run with Docker Compose, first configure `config/default.json`, then run:

```bash
docker compose up --build
```

The showcase keeps attempts, results and display sessions in process memory. Run a single server process; restarting clears sessions and in-progress attempts. See [storage and sessions](docs/getting-started.md#local-state-and-health).

## Documentation

- [Choose an integration flow](docs/README.md): browser, QR, SMS, SIM, Mobile/S2S or Play Integrity.
- [Showcase HTTP endpoints](docs/reference/http.md) and [source map](docs/reference/source-map.md).
- [Running, configuration and verification](docs/getting-started.md).

The showcase endpoints are examples of application behavior, not required IPification APIs. The demo is not a complete production OAuth/OIDC implementation; review the [integration and security boundaries](docs/integration/browser.md#integration-and-security-boundaries) before adapting it. Automated browser tests use a mock provider and do not verify live credentials, carriers or physical devices.
