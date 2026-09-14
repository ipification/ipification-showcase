# IPification Showcase

A demonstration application showcasing IPification's identity verification and authentication features.

## Quick Start

```bash
# Install dependencies
npm install

# Configure application
cp config/default.json.sample config/default.json
# Edit config/default.json with your IPification credentials

# Start server
npm start
```

Access at `http://<your-ip-address>:3000`

📖 **For detailed documentation, see [docs/](docs/) folder:**

- [Quick Start Guide](docs/QUICKSTART.md) - Get started in 5 minutes
- [API Documentation](docs/API.md) - Complete API reference
- [Architecture](docs/ARCHITECTURE.md) - System design and architecture
- [Play Integrity backend demo](docs/PLAY_INTEGRITY.md) - Google Play Integrity setup and verification flow

## Features

- **Phone Number Verification** (IP, IP+, IM, SIM)
- **Quick Access Login** (IP, IP+, IM, SIM)
- **Identity Services** (Anonymous Identity, KYC)
- **QR Code Desktop Flow**
- **Server-to-Server Backchannel**
- **TS43 Protocol Support**

## Prerequisites

- Node.js >= 22.x
- IPification account credentials

## Configuration

See [docs/QUICKSTART.md](docs/QUICKSTART.md) for configuration details.

## Environment Variables

| Variable   | Description                                        | Default       |
| ---------- | -------------------------------------------------- | ------------- |
| `PORT`     | Server port                                        | `3000`        |
| `NODE_ENV` | Environment (`development`, `stage`, `production`) | `development` |

## Docker Deployment

```bash
docker-compose up -d
```

Access at `http://localhost:3001`

## Development

```bash
npm run dev  # Start with auto-reload
```

## Documentation

- **[Quick Start](docs/QUICKSTART.md)** - Setup guide and common issues
- **[API Reference](docs/API.md)** - Complete endpoint documentation
- **[Architecture](docs/ARCHITECTURE.md)** - System design and components
- **[Play Integrity backend demo](docs/PLAY_INTEGRITY.md)** - Backend verification setup, request hashing, and Android checklist. The IPification flow creates a short-lived attempt, uses its backend-returned hash with a fresh Android token, verifies once, calls `setState` before IPification, then exchanges the returned code and state.
- **[Documentation Index](docs/INDEX.md)** - Documentation overview

## Support

- Developer Portal: https://developer.ipification.com/
- Website: https://www.ipification.com/
