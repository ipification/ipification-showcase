# Next.js integration guide

This guide is the starting point for the Next.js showcase documentation. It explains the current behavior of the application and where to find its implementation. It is for developers integrating IPification as well as developers running the demo. The examples use placeholders: obtain your own credentials, enabled products, callback URLs and supported scopes from your IPification configuration.

## Choose a flow

| Goal | Showcase methods | Guide |
| --- | --- | --- |
| Verify an entered number | IP, IP+, IP via App, IM | [Browser authorization](browser-flows.md) |
| Log in with a mobile identity | IP, IP+, IM | [Browser authorization](browser-flows.md) |
| Obtain anonymous identity or verify KYC phone | Anonymous Identity, KYC | [Browser authorization](browser-flows.md) |
| Verify or obtain a number using a SIM credential | PNV SIM, Login SIM | [SIM / TS43](sim.md) |
| Verify an entered number with an OTP | PNV SMS | [SMS](sms.md) |
| Start on desktop and continue on a phone | QR for supported browser flows | [QR and polling](qr.md) |

[Run the demo](running.md) · [Showcase HTTP endpoints](api.md) · [Source walkthrough](../NEXTJS_AUTH_FLOWS.md)

## Read the source

- Start with [the screen](../../src/features/login/showcase.tsx), then [method selection and preparation](../../src/features/login/use-verification.ts).
- For browser redirects, follow [web handlers](../../src/server/auth/web.ts), [auth service](../../src/server/auth/service.ts), then [provider calls](../../src/server/auth/provider.ts). [Attempt storage](../../src/server/auth/attempts.ts) handles browser bindings, expiry and concurrent callbacks.
- For QR, follow [status polling](../../src/features/auth/auth-status.ts). For SMS and SIM, start with [SMS UI](../../src/features/sms/use-sms-flow.tsx) or [SIM UI](../../src/features/ts43/use-ts43-flow.tsx), then [CIBA provider calls](../../src/server/ciba/provider.ts).
- [Play Integrity service](../../src/server/integrity/service.ts) is a separate optional Android flow. [Session store](../../src/server/session/store.ts) holds demo display sessions; it is not the provider's user session.

## Who calls whom?

The **browser** calls the showcase's own endpoints. The **showcase backend** holds client credentials and calls the IPification authorization, token, userinfo and CIBA endpoints. In your integration, replace the showcase backend with your own backend and register your own callback URI. Paths such as `/auth/prepare`, `/auth/status`, `/sms/auth` and `/ts43/token` are showcase implementation choices, not IPification API requirements.

Keep client secrets and access tokens on the backend. Examples are educational and do not constitute a complete production OAuth implementation: validate state and redirect URI, use HTTPS, and implement provider-supported OAuth/OIDC protections, including PKCE and ID-token validation where applicable. The showcase does not itself implement PKCE or ID-token validation in the browser flow. Never log credentials, authorization codes, tokens, OTPs or full userinfo.

Older top-level guides describe earlier implementations; use this guide and the current source for Next.js behavior.
