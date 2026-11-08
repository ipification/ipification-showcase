# Source map

[Documentation home](../README.md) · [Showcase HTTP reference](http.md)

Follow a user action through the UI, showcase backend and provider boundary. Source and tests are the authority for the current implementation; test fixtures do not prove production provider behavior.

| Concern | Reading path |
| --- | --- |
| Flow selection and browser start | [Showcase UI](../../src/features/login/showcase.tsx) → [verification hook](../../src/features/login/use-verification.ts) → [web handlers](../../src/server/auth/web.ts) → [auth service](../../src/server/auth/service.ts) |
| Provider authorization and code exchange | [Authorization URL](../../src/server/auth/provider.ts) → [OIDC HTTP client](../../src/server/shared/http-client.ts) |
| Attempt expiry, binding and replay | [Attempts](../../src/server/auth/attempts.ts) · [binding cookies](../../src/server/auth/state-cookies.ts) · [contract tests](../../tests/contracts/oauth-state.test.ts) |
| QR completion | [QR UI](../../src/features/qr/qr-dialog.tsx) → [polling](../../src/features/auth/auth-status.ts) → [web handlers](../../src/server/auth/web.ts) |
| SMS | [SMS UI](../../src/features/sms/use-sms-flow.tsx) → [CIBA handlers](../../src/server/ciba/handlers.ts) → [provider calls](../../src/server/ciba/provider.ts) |
| SIM | [Capability detection](../../src/features/login/use-showcase-browser.ts) → [SIM UI](../../src/features/ts43/use-ts43-flow.tsx) → [CIBA handlers](../../src/server/ciba/handlers.ts) → [provider calls](../../src/server/ciba/provider.ts) |
| Mobile and S2S | [Mobile handler](../../src/server/auth/mobile.ts) · [S2S route](../../src/app/auth/s2s/signin/route.ts) · [result store](../../src/server/store/auth-results.ts) |
| Android integrity | [HTTP handler](../../src/server/integrity/handlers.ts) → [service](../../src/server/integrity/service.ts) → [verifier](../../src/server/integrity/verifier.ts) and [attempts](../../src/server/integrity/attempts.ts) |
| Demo state and session | [Memory cache](../../src/server/store/memory.ts) · [session store](../../src/server/session/store.ts) · [repository interfaces](../../src/server/auth/repositories.ts) |
| Runtime configuration | [Configuration loader](../../runtime/config.mjs) · [sample config](../../config/default.json.sample) · [environment sample](../../.env.example) |

Client integration code should be guided by the provider boundary and the documented security limitations, not by blindly copying the demo's UI, cache, display-session behavior or internal endpoint paths.
