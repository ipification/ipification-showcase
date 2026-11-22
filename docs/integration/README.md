# Express integration guide

This guide is the starting point for the Express showcase documentation. It explains the current behavior of the application and where to find its implementation. It is for developers integrating IPification as well as developers running the demo. The examples use placeholders: obtain your own credentials, enabled products, callback URLs and supported scopes from your IPification configuration.

## Choose a flow

| Goal | Showcase methods | Guide |
| --- | --- | --- |
| Verify an entered number | IP, IP+, IP via App, IM | [Browser authorization](browser-flows.md) |
| Log in with a mobile identity | IP, IP+, IM | [Browser authorization](browser-flows.md) |
| Obtain anonymous identity or verify KYC phone | Anonymous Identity, KYC | [Browser authorization](browser-flows.md) |
| Verify or obtain a number using a SIM credential | PNV SIM, Login SIM | [SIM / TS43](sim.md) |
| Verify an entered number with an OTP | PNV SMS | [SMS](sms.md) |
| Start on desktop and continue on a phone | QR for supported browser flows | [QR and polling](qr.md) |
| Exchange a mobile code or read a stored Showcase result | Mobile and S2S endpoints | [Mobile and S2S](mobile-s2s.md) |

[Run the demo](running.md) · [Showcase HTTP endpoints](api.md)

Run `npm run docs:build` from the repository root to generate the searchable handler and type reference. Open `docs/generated/reference/index.html`. [Reference overview](../reference/README.md)

## Read the source

- **Screen:** [showcase entry](../../public/js/showcase.js), [routes](../../src/modules/showcase/routes.ts) and [views](../../src/views/showcase).
- **Browser authorization:** [browser routes](../../src/modules/browser-auth/routes.ts) → [web handlers](../../src/modules/browser-auth/web.ts) → [auth service](../../src/modules/browser-auth/service.ts) → [authorization URL builder](../../src/modules/browser-auth/provider.ts) and [code exchange](../../src/shared/server/common/authorization-code.ts). [Attempt storage](../../src/modules/browser-auth/attempts.ts) handles bindings, expiry and concurrent callbacks.
- **QR:** [QR UI and polling](../../public/js/flows/qr.js) → browser auth status and completion routes. The [pending page](../../public/js/pending.js) also polls status for applicable IM flows.
- **SMS:** [SMS UI](../../public/js/flows/sms.js) → [routes](../../src/modules/sms/routes.ts) → [controller](../../src/modules/sms/controller.ts) → [shared CIBA service](../../src/shared/server/ciba/service.ts) and [provider calls](../../src/shared/server/ciba/provider.ts).
- **SIM:** [SIM UI](../../public/js/flows/sim.js) → [routes](../../src/modules/sim/routes.ts) → [controller](../../src/modules/sim/controller.ts) → the shared CIBA service and provider. SIM has its own credential and rate-limit steps.
- **Mobile and S2S:** [mobile routes](../../src/modules/mobile/routes.ts) and [controller](../../src/modules/mobile/controller.ts) exchange a code; [S2S routes](../../src/modules/s2s/routes.ts) and [controller](../../src/modules/s2s/controller.ts) read a stored result.
- **Play Integrity:** [routes](../../src/modules/play-integrity/routes.ts) and [service](../../src/modules/play-integrity/service.ts) implement the optional Android flow. The shared [session store](../../src/shared/server/session/store.ts) holds demo display sessions, not the provider's user session.

## Who calls whom?

The **browser** calls the showcase's own endpoints. The **showcase backend** holds client credentials and calls the IPification authorization, token, userinfo and CIBA endpoints. In your integration, replace the showcase backend with your own backend and register your own callback URI. Paths such as `/auth/prepare`, `/auth/status`, `/sms/auth` and `/ts43/token` are showcase implementation choices, not IPification API requirements.

Keep client secrets and access tokens on the backend. Browser auth validates the ID token and nonce, but does not implement PKCE; mobile and Play Integrity code exchanges lack browser attempt nonce binding. IM backchannel source authentication also remains a deployment responsibility. These examples are educational and do not constitute a complete production OAuth implementation. Never log credentials, authorization codes, tokens, OTPs or full userinfo.

The source links above describe the current implementation.
