# IPification Showcase

A Next.js demonstration of IPification phone verification, login and identity flows.

## Start locally

Use Node.js 24.22.0, npm and your IPification configuration:

```bash
npm ci
cp config/default.json.sample config/default.json
cp .env.example .env.local
# Configure credentials in config/default.json.
npm run config:check
npm run dev
```

The demo keeps temporary authentication state and sessions in memory. Run a single server process; restarts clear sessions and in-progress attempts. For integration guidance, see [storage and sessions](docs/nextjs/running.md#storage-and-sessions).

For phone QR testing, open one of the Network URLs printed at startup on the desktop and use a phone that can reach that address. Register the actual callback URL with your provider.

Run with Docker Compose from the repository root after configuring `config/default.json`:

```bash
docker compose up --build
```

See the [integration guide](docs/nextjs/README.md) and [local setup and testing](docs/nextjs/running.md). The Playwright tests use a local mock provider and do not verify live stage or carrier behavior.
