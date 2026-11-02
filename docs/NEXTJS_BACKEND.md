# Next.js backend structure

> Historical reference: the application now lives at the repository root. Use the [current integration guide](nextjs/README.md) for setup and flows.

This is the application-service refactor of the [Next.js migration](NEXTJS_MIGRATION.md). The initial refactor preserved behavior. The approved 2026-10-31 follow-up below adds explicit state/token validation and corrects callback metadata/server selection; PNV and demo display-session policy remain unchanged.

## Request flow

1. `src/app/**/route.ts` selects the endpoint. `auth/web.ts`, `auth/mobile.ts`, `ciba/handlers.ts` and `integrity/handlers.ts` are HTTP adapters: they parse requests and apply status codes, headers, cookies, redirects and safe error presentation.
2. Each feature's `input.ts` projects known request fields into a named DTO. Integrity retains its existing required-string/JWT-shape validation. General OAuth/CIBA fields remain `unknown` when their wire format belongs to the provider; server/client lookup keeps the previous strict-match/default behavior. Additional schema restrictions need separate compatibility approval.
3. `auth/service.ts`, `ciba/service.ts` and `integrity/service.ts` orchestrate use cases with plain data and discriminated outcomes. They do not import Next.js, accept a Request or construct a Response. Factories accept explicit provider/repository ports for failure and ordering tests; default instances are stateless.
4. Provider clients (`auth/provider.ts`, `ciba/provider.ts`, the shared HTTP client and Integrity verifier) own outbound protocol calls. `ProviderError` gives token/userinfo/authentication/DCQL failures a known step, message, optional upstream status and payload. HTTP adapters preserve each endpoint's existing presentation. Friendly callback pages only expose allowlisted diagnostic codes, never raw provider payloads.
5. `auth/repositories.ts` declares session/result ports and connects them to the existing Redis implementations in `session/store.ts` and `store/auth-results.ts`. `integrity/ports.ts` describes the attempt/transaction, verifier and code-exchange ports. `integrity/runtime.ts` composes environment configuration and concrete adapters. Atomic Redis transitions and TTLs remain in their existing implementations; clients read completion through owner-authenticated HTTP status polling.

`shared/context.ts` defines runtime facts required by services. `shared/errors.ts` provides target lookup, `ApplicationError`, `ProviderError` and `UpstreamUnavailableError`. There is no service locator or dependency-injection framework.

## Customer reading path

For SMS and SIM, the HTTP handler, application service, and provider client now use the same operation names. Start at the route, then find that name in [handlers](../src/server/ciba/handlers.ts), [service](../src/server/ciba/service.ts), and [provider](../src/server/ciba/provider.ts):

| Endpoint | Operation | Provider sequence |
| --- | --- | --- |
| `POST /sms/auth` | `sendSmsCode` | CIBA auth with SMS channel/message |
| `POST /sms/token` | `verifySmsCode` | SMS callback → token → userinfo |
| `POST /ts43/auth` | `createSimCredentialRequest` | CIBA auth → DCQL credential request |
| `POST /ts43/token` | `exchangeSimCredential` | SIM credential callback → token → userinfo |

The named handlers share input decoding and HTTP response formatting. Only SIM auth runs its existing rate limiter, before client/server lookup. Auth's text client-not-found response and token's JSON client-not-found response remain distinct. The previously unused `ciba/sms.ts` and `ciba/ts43.ts` wrappers were removed.

The provider's `submitCallback` is deliberately best-effort: a failed SMS/SIM callback still proceeds to the token request. Shared token/userinfo code retains that order and the existing error normalization. It adds no retries. The approved follow-up validates token bodies before userinfo.

After token exchange, `exchangeAndCreateDemoSession` calls `createDemoDisplaySession` for either success or error data. Its `isAuthenticated` flag permits viewing the Showcase result page; it is not a production phone-verification acceptance policy. Internal success is named `token_exchanged` to describe what actually completed. The external response, cookie behavior, and error-session fallback are unchanged.

[Integrity service](../src/server/integrity/service.ts) keeps three named steps in one file: `createAttempt`, `verifyAttempt`, and `exchangeCode`. The existing `execute` entry point validates input and awaits each step inside its outer exception boundary. Atomic claim/reject/approve/finalize operations remain in the repository; extracting functions does not move these boundaries.

For the frontend-to-backend walkthrough and the fields used at each step, see [Reading the authentication demo](NEXTJS_AUTH_FLOWS.md).

### Remaining web/mobile and support APIs

Auth's real HTTP/service entry points now have matching names: `startWebAuthentication`, `handleAuthorizationCallback`, `completeWebAuthentication`, `exchangeMobileCode`, and `readS2sResult`. The service contains named functions in flow order rather than short generic object-method names. Provider URL construction keeps the existing parameters and makes the IP-via-App endpoint selection explicit.

Public config, GeoIP, and S2S remain small route-local handlers. Their names explain the operation; no extra service/factory was added. The public config projection now includes default and per-server callback URLs; GeoIP still prefers a lookup match over its configured fallback; S2S still reads cached data without consuming it or setting a cookie. Mobile still uses the submitted redirect URI and returns JSON without adopting a browser session.

Lightweight redirects, session-error consumption, diagnostics and health probes were reviewed and retain their small implementations. The customer guide lists their roles separately from authentication steps. Callback cancellation still preserves existing session data, and backchannel callbacks cannot create browser sessions; all web callbacks now claim validated prepared state before side effects.

## Behavior that deliberately remains

- Resolve server/client with existing lookup defaults. Duplicate web state values are rejected; state cannot be synthesized on callback.
- Write both display/raw results before notifying the QR room. A backchannel callback returns before the QR path. QR fails only for string `'false'`.
- Completion claims the owner-bound attempt, reads the result, then creates/replaces the display session. Missing/unprepared completion fails closed. S2S reads do not consume data.
- SMS/TS43 provider callback is best-effort. A failed token exchange still creates an authenticated **demo display** session containing error data. A successful token followed by a failed session write still attempts error-display adoption, as before.
- TS43 rate limits run before target lookup. Status/header differences between SMS/TS43 auth and token endpoints remain in the adapters.
- Integrity feature gating and 16 KB parsing precede application execution. Verification uses the trusted incoming hostname. Attempts are claimed before verification; rejected attempts and consumed/failed transactions retain their existing single-use semantics and snapshot credentials/redirects.

A typed boundary is not a new security policy. State binding/replay/expiry and token-response validation were explicitly approved as follow-up work; PNV authorization and raw diagnostic fields in legacy machine APIs remain outside that scope. Provider payloads remain private in the friendly browser error flow but are retained where an existing machine API already returns them.

## Verification

`tests/services/` injects repositories/providers and tests ordering, callback precedence, error/session adoption, domain policy and exchange completion without starting Next, Redis or a real provider. `tests/unit/provider-error.test.ts` verifies the normalized error envelope and safe callback classification. Existing HTTP contracts and Redis/process/Chromium suites exercise the production adapters.

For this refactor, HTTP/process/browser checks run from a source-identical verification copy under the plan's ignored scratch directory, with private configs and env files excluded. Only the copied Turbopack root is adjusted so the dependency symlink stays inside its root. The developer's active server, `.next` output, private config and Redis are not stopped or reused. This verifies the copied current source, not staging or real-device/provider acceptance.

The underlying Google verifier and Redis attempt implementation still contain legacy dynamic record handling; their application-facing ports are typed. Replacing those internals or tightening provider schemas is not implied by this refactor.

## Acceptance record (2026-10-29)

- Node 24.22.0: lint/typecheck and production build passed.
- Complete Next unit/HTTP run: 38 tests passed; one subsequently added attempt-creation case also passed in the five-test Integrity service file (39 distinct current tests verified).
- Redis/process integration: 8 passed, including cross-process callback/session sharing, restart, outage and concurrent Integrity exchanges. The optional Docker image test was skipped; no image rebuild/deployment claim is made for this refactor.
- Chromium: all 15 current scenarios passed on isolated port 3003. Existing uncommitted UI/test changes were included in the verification copy but not committed by this backend work.
- Legacy: 109 passed with a synthetic local-only config fixture. The initial copy lacked ignored config and failed one mounted-app test; rerunning with the fixture passed. No private credentials were used.
- Source hashes for `src/server`, `src/shared` and `runtime` matched between working source and verification copy.
- Independent review of commits `01d3a8f..d2f0640`: no Critical/Important findings. The reviewer did not independently assess runtime suites; the results above were observed by the implementer.

Historical deferred minor (resolved by the approved 2026-10-31 hardening): if a provider returns HTTP 200 with a `null` token body, the local `access_token` read occurs inside the userinfo provider wrapper. The callback classification becomes `PROVIDER_UNAVAILABLE`/`userinfo` rather than the previous `AUTH_FAILED`/`application`, despite no userinfo request occurring. Valid provider responses and endpoint statuses are unaffected. This diagnostic edge case needs a separate regression/fix before claiming exhaustive malformed-provider equivalence.

Decisions: the approved follow-up uses one combined design/plan; permissive wire inputs remain unknown rather than receiving new rejection rules; verification uses an isolated source copy; the result page has only a type assertion for the previously unvalidated state field, with no rendering change. Costs: less document separation, remaining malformed-input/rendering risks, and no claim that copied-tree verification substitutes for a clean CI/staging run. External provider/device/staging acceptance remains outstanding.

## Acceptance record (2026-10-31 readability follow-up)

- The extended SMS/SIM HTTP characterization passed against the original backend, including literal callback payloads, scope, nonce, DCQL and callback → token → userinfo order. Three extra Integrity exception-boundary scenarios also passed against the original service.
- Current source: Node 24.22.0 production build, lint and typecheck passed; 42 unit/HTTP tests, 8 Redis/process integration tests and all 28 Chromium scenarios passed. The optional Docker image smoke test was skipped because no test image was supplied.
- The verification copy's server TypeScript file set and hashes match the working source, including removal of the two unused wrappers. No private config or real provider was used.
- Independent source review against the captured pre-change backend found no material behavioral differences. No frontend UI, Redis atomic implementation, endpoint contract or production authentication policy was changed by this follow-up.

## Acceptance record (2026-10-31 remaining APIs)

- Baseline characterization: 10 Auth service/web/mobile tests passed before refactoring, including two added service scenarios for authenticated cancellation and malformed callback-state ordering. HTTP checks also cover repeated/missing S2S reads, mobile target errors and provider rejection.
- Current source: Node 24.22.0 build, lint and typecheck passed; all 44 unit/HTTP tests, 8 Redis/process integrations and 28 Chromium scenarios passed. The optional Docker smoke test remained skipped because no test image was supplied.
- A fresh reviewer compared Auth, S2S, config and GeoIP against captured pre-phase sources and found no material differences. The complete `src/` file set and hashes match the isolated verification copy.
- API paths, headers, statuses, cookies, response precedence and legacy acceptance behavior remain unchanged. This phase did not change frontend UI, session/result stores, runtime or private configuration. No real-provider or deployment verification was performed.

## Approved authentication hardening (2026-10-31)

The [customer flow guide](NEXTJS_AUTH_FLOWS.md) describes the changed web protocol. `auth/attempts.ts` owns atomic Redis phase/binding/expiry checks, separate from existing result/session stores. `auth/state-cookies.ts` issues random per-attempt HttpOnly owner and callback cookies. Separate owner cookies avoid simultaneous first attempts rotating a shared binding. Direct attempts are valid for five minutes. QR has two minutes to start; a successful first start atomically opens a separate five-minute completion window. Records remain for ten minutes to explain recently expired requests. QR owner cookies last seven minutes to cover the maximum scan plus completion lifetime; callback cookies and other owner cookies keep five minutes. Redis failure does not create process-local authorization state.

Callback persistence precedes publishing a completed phase and notification. Failure records contain safe diagnostic metadata; the QR owner can receive the same friendly error without creating an authenticated session. Completion has an atomic claim before session writes. IM overlap uses an owner-authenticated pending page and reuses the stored exchange. Mobile code submission and signed Integrity state stay separate protocols. S2S bearer-state reads are unchanged, and PKCE/ID-token validation and real-provider/device acceptance remain outside this work.

TS43 token payloads preserve server selection. Public callbacks include a server id and an additive per-server map. Shared authorization-code and CIBA token validation rejects missing/empty/non-string access tokens before userinfo. Item 1's PNV/session policy stays unchanged, including demo error sessions.

Verification for this follow-up: Node 24.22.0 production build, lint and typecheck passed; 51 unit/HTTP tests, 8 Redis/process integration tests, and all 31 Chromium scenarios passed. A strengthened TS43 test also passed using the secondary server for both auth/token requests. The optional Docker test was skipped (no supplied test image). Current `src`, `runtime`, `tests` and `e2e` file sets/hashes match the isolated verification copy; its only build configuration adaptation remains the Turbopack root. No private configs, active dev server, real provider, commit/push or deployment were used.

Fresh review found two races, now fixed with failing-then-passing regressions: an IM browser return overlapping backchannel exchange now waits without another exchange, and QR refresh retires the previous status requests before awaiting replacement preparation. Chromium verifies completion through HTTP polling without socket traffic and recovery after status requests fail. Real IM sender/provider/device validation remains an external acceptance boundary.

QR expiry UX follow-up: the popup now carries the prepare response's `expiresAt`, displays an mm:ss countdown, recomputes it on focus/visibility return, and hides the expired QR with a create-new-code action. The backend five-minute deadline and API contracts are unchanged. Regression was observed failing before implementation; build, lint, typecheck and all 32 Chromium scenarios pass. Fake-clock refresh tests explicitly align fixture deadlines with their simulated browser clock. Working/copy `src` and `e2e` file sets/hashes match.

QR two-minute scan follow-up: QR prepare now expires after 120 seconds; the first successful start atomically sets a fresh 300-second completion deadline. Replays cannot extend it. Direct flow deadlines remain unchanged. Owner binding lasts 420 seconds for QR; callback bindings remain 300 seconds. Status responses add `started` and the current `expiresAt` so the desktop can hide a scanned code and continue waiting beyond its original scan deadline. Backend expiry confirmation stops recovery; local countdown expiry alone does not discard a valid scan that happened immediately before it. No PNV/session acceptance changes.

Verification: the deadline/cookie regression failed against the old five-minute QR preparation, then passed. Sequential Node 24.22.0 build, lint/typecheck, 52 unit/HTTP tests, 8 integration tests and 33 Chromium scenarios pass; optional Docker test remains skipped. Browser checks cover 02:00 scan countdown, late scan transitioning to completion, expiry and refresh. No commit/push, real-provider/device or deployment verification.


## Provider deadlines and shared status tracking (2026-10-31)

Provider HTTP calls use the shared form/JSON boundary with Axios and abort deadlines, defaulting to 15000 ms per request (`PROVIDER_HTTP_TIMEOUT_MS`, integer 1..120000). No retry was introduced. Typed timeout errors map to safe `PROVIDER_TIMEOUT` diagnostics; CIBA callback failures still allow its existing token/userinfo sequence. Fixed SMS/SIM scopes and synchronous debug calls remain unchanged.

The QR polling hook and IM pending page use `features/auth/auth-status.ts` for nonoverlapping polls every 2000 ms, request cancellation, recovery, hard expiry and completion URL validation. The status service can recognize an already finished exact-state authenticated session after owner-cookie removal, without changing session acceptance. See [flow guide](NEXTJS_AUTH_FLOWS.md#provider-deadlines-and-status-recovery).


Verification: Node 24.22.0 lint, typecheck and final production build passed; 65 unit/HTTP tests, 8 Redis/process integrations and 43 Chromium scenarios passed. Optional Docker smoke test skipped without a supplied image. New browser regressions failed before implementation and pass now for offline IM recovery and reopening an already finished pending page. Source sets/hashes match the verification copy. A fresh source reviewer found no material issues; the active mobile dev server remains ready. No real-provider/device test, commit/push or deployment was performed.


## Automatic public origin (2026-10-31)

The request identity resolver always determines the origin per request in every environment. A single trusted Kubernetes ingress uses `TRUST_PROXY_HOPS=1` with sanitized forwarded host/protocol; direct access retains `0`. The application adds no domain allowlist. The environment example and Compose default no longer force localhost. Authentication state remains bound to the origin captured at preparation; callbacks still require provider registration.


Verification for the initial automatic-origin follow-up: production config with no origin passed. A production HTTP regression covers two forwarded HTTPS domains plus direct HTTP, QR/provider callback URLs, Secure cookies and rejection when an existing attempt changes origin. Build, lint/typecheck, 66 unit/API tests, 8 integration tests and 43 Chromium tests passed; the browser fixture uses automatic origin. Optional Docker smoke remained skipped without an image. Live local QR preparation succeeds for both localhost and LAN IP after restart. No Kubernetes deployment or real-provider acceptance was performed.


## Request-derived origin only and dev URLs (2026-10-31)

The origin override was removed from the app, configuration validation, Compose/env samples and test fixtures. Login rendering and HTTP handlers use the same request identity rules. Cross-replica tests model the shared public host supplied by ingress instead of a fixed application setting. Per-attempt origin binding is unchanged.

Development startup uses Node network interfaces to print localhost and deduplicated noninternal IPv4 login URLs, with the configured port and a same-network phone QR explanation. No LAN address produces a connect/restart hint. Production retains the existing concise listening message. No external network utility or dependency is required.


Verification for complete override removal: lint, typecheck, production build, 66 unit/API tests, 8 integrations and 43 Chromium tests pass. Cross-replica tests now forward a shared public host; the actual dev startup regression verifies local/network URLs and the QR instruction. Source sets/hashes match the isolated copy. A fresh reviewer found no material findings. The active restarted dev server prints its LAN URLs and prepares correct QR URLs from both localhost and LAN requests. Optional Docker smoke skipped without a supplied image; no real-provider or deployment claim.
