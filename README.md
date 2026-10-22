# IPification Showcase

A demonstration application showcasing IPification's identity verification and authentication features.

## Features

- **Phone Number Verification** (IP, IP+, IM, SIM)
- **Quick Access Login** (IP, IP+, IM, SIM)
- **Identity Services** (Anonymous Identity, KYC)
- **QR Code Desktop Flow**
- **Server-to-Server Backchannel**
- **TS43 Protocol Support**

## Local Development

Choose either Node.js or Docker Compose to run the application locally.

### Prerequisites

- IPification account credentials
- For Node.js: Node.js >= 24.0.0 and npm (24.22.0 is pinned in `.tool-versions` and Docker)
- For Docker Compose: Docker with the Compose plugin

### Run with Node.js

Install dependencies and create the local configuration:

```bash
npm install
cp config/default.json.sample config/default.json
```

Edit `config/default.json` with your IPification credentials, then start the server with auto-reload:

```bash
npm run dev
```

Open `http://localhost:3000` (unless `PORT` is overridden in your environment or `.env`). To run without auto-reload, use `npm start`.

### Run with Docker Compose

Create the configuration file mounted by Compose:

```bash
cp config/default.json.sample config/default.json
```

Edit `config/default.json` with your IPification credentials, then build and start the container:

```bash
docker compose up -d --build
```

Open `http://localhost:3001`. Compose sets `PORT=3001` and mounts `config/default.json` as `/usr/app/config/default.json`. This container runs `npm start` without auto-reload; rebuild after application code changes.

View logs or stop the local container:

```bash
docker compose logs -f app
docker compose down
```

### Configuration

See the [Quick Start Guide](docs/QUICKSTART.md) for setup and troubleshooting, and the [Sample Config Reference](docs/CONFIG_DEFAULT_JSON_SAMPLE.md) for configuration fields.

The application loads `.env` for local environment overrides. Docker Compose sets the container port explicitly in `docker-compose.yml`.

| Variable   | Description                                        | Default                      |
| ---------- | -------------------------------------------------- | ---------------------------- |
| `PORT`     | Server port                                        | `3000` (`3001` with Compose) |
| `NODE_ENV` | Environment (`development`, `stage`, `production`) | `development`                |

When testing from a mobile device, replace `localhost` with your computer's reachable IP address and configure the corresponding callback URL in your IPification client settings.

## Documentation

- **[Quick Start](docs/QUICKSTART.md)** - Setup guide and common issues
- **[API Reference](docs/API.md)** - Complete endpoint documentation
- **[Architecture](docs/ARCHITECTURE.md)** - System design and components
- **[PNV via IP](docs/PNV.md)** - Phone input, authorization redirect, callback, code exchange, and verification-result handling
- **[Sample Config Reference](docs/CONFIG_DEFAULT_JSON_SAMPLE.md)** - Application configuration fields
- **[Play Integrity backend demo](docs/PLAY_INTEGRITY.md)** - Backend verification setup, request hashing, and Android checklist
- **[Documentation Index](docs/INDEX.md)** - Documentation overview

## Support

- Developer Portal: https://developer.ipification.com/
- Website: https://www.ipification.com/
