# IPification Showcase documentation

Use this guide to run the showcase, trace a flow from its UI to IPification, and understand which parts belong in your application. Obtain credentials, enabled products, scopes and registered callback URLs from your IPification configuration. Examples use placeholders; they are not live credentials.

| Your goal | Start here |
| --- | --- |
| Run the app and try its UI | [Run the showcase](getting-started.md) |
| Verify a number, log in, or retrieve identity data through a browser | [Browser authorization](integration/browser.md) |
| Start on desktop and complete on a phone | [QR flow](integration/qr.md) |
| Verify a number using SMS | [SMS](integration/sms.md) |
| Use a supported SIM credential | [SIM / TS43](integration/sim.md) |
| Exchange a mobile authorization code or read a showcase result | [Mobile and S2S](integration/mobile-s2s.md) |
| Add the optional Android integrity demonstration | [Play Integrity](integration/play-integrity.md) |
| Find a showcase endpoint or trace source code | [HTTP reference](reference/http.md) · [Source map](reference/source-map.md) |

## The integration boundary

The browser calls the **showcase backend**, which holds the client secret and calls **IPification**. `/auth/prepare`, `/auth/status`, `/sms/auth`, `/ts43/auth`, and the other paths in the [showcase API reference](reference/http.md) are application endpoints, not IPification API requirements. Implement your own backend and session policy rather than assuming the showcase endpoints are an IPification SDK.

The showcase demonstrates behavior; it is not a complete production OAuth/OIDC implementation. Its browser flow binds `state` to an attempt, but does not implement PKCE or ID-token validation, and its userinfo helper uses `skipSubjectCheck`. Apply the protections supported by your provider and validate identity according to your application. Never expose client secrets, access tokens, authorization codes, OTPs or userinfo in logs or client-side secrets. See [browser flow and security](integration/browser.md#integration-and-security-boundaries).
