# Next.js backend structure

This is the application-service refactor of the [Next.js migration](NEXTJS_MIGRATION.md). It changes responsibility boundaries, not the authentication policy or public HTTP contracts.

## Request flow

1. `src/app/**/route.ts` selects the endpoint. `auth/web.ts`, `auth/mobile.ts`, `ciba/handlers.ts` and `integrity/handlers.ts` are HTTP adapters: they parse requests and apply status codes, headers, cookies, redirects and safe error presentation.
2. Each feature's `input.ts` projects known request fields into a named DTO. Integrity retains its existing required-string/JWT-shape validation. General OAuth/CIBA fields remain `unknown` when their wire format belongs to the provider; server/client lookup keeps the previous strict-match/default behavior. Additional schema restrictions need separate compatibility approval.
3. `auth/service.ts`, `ciba/service.ts` and `integrity/service.ts` orchestrate use cases with plain data and discriminated outcomes. They do not import Next.js, accept a Request or construct a Response. Factories accept explicit provider/repository ports for failure and ordering tests; default instances are stateless.
4. Provider clients (`auth/provider.ts`, `ciba/provider.ts`, the shared HTTP client and Integrity verifier) own outbound protocol calls. `ProviderError` gives token/userinfo/authentication/DCQL failures a known step, message, optional upstream status and payload. HTTP adapters preserve each endpoint's existing presentation. Friendly callback pages only expose allowlisted diagnostic codes, never raw provider payloads.
5. `auth/repositories.ts` declares session/result ports and connects them to the existing Redis implementations in `session/store.ts` and `store/auth-results.ts`. `integrity/ports.ts` describes the attempt/transaction, verifier and code-exchange ports. `integrity/runtime.ts` composes environment configuration and concrete adapters. Atomic Redis transitions, TTLs and Socket.IO publishing remain in their existing implementations.

`shared/context.ts` defines runtime facts required by services. `shared/errors.ts` provides target lookup, `ApplicationError`, `ProviderError` and `UpstreamUnavailableError`. There is no service locator or dependency-injection framework.

## Behavior that deliberately remains

- Resolve server/client before the missing-state redirect. Preserve duplicate query values rather than quietly taking the first.
- Write both display/raw results before notifying the QR room. A backchannel callback returns before the QR path. QR fails only for string `'false'`.
- Completion reads the result, then creates/replaces the session. Missing completion keeps five reads and five delays. S2S reads do not consume data.
- SMS/TS43 provider callback is best-effort. A failed token exchange still creates an authenticated **demo display** session containing error data. A successful token followed by a failed session write still attempts error-display adoption, as before.
- TS43 rate limits run before target lookup. Status/header differences between SMS/TS43 auth and token endpoints remain in the adapters.
- Integrity feature gating and 16 KB parsing precede application execution. Verification uses the trusted incoming hostname. Attempts are claimed before verification; rejected attempts and consumed/failed transactions retain their existing single-use semantics and snapshot credentials/redirects.

A typed boundary is not a new security policy. Existing state validation, PNV authorization, raw diagnostic fields in legacy API responses and provider-response validation are separate hardening work. Provider payloads remain private in the friendly browser error flow but are retained where an existing machine API already returns them.

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

Deferred minor: if a provider returns HTTP 200 with a `null` token body, the local `access_token` read occurs inside the userinfo provider wrapper. The callback classification becomes `PROVIDER_UNAVAILABLE`/`userinfo` rather than the previous `AUTH_FAILED`/`application`, despite no userinfo request occurring. Valid provider responses and endpoint statuses are unaffected. This diagnostic edge case needs a separate regression/fix before claiming exhaustive malformed-provider equivalence.

Decisions: the approved follow-up uses one combined design/plan; permissive wire inputs remain unknown rather than receiving new rejection rules; verification uses an isolated source copy; the result page has only a type assertion for the previously unvalidated state field, with no rendering change. Costs: less document separation, remaining malformed-input/rendering risks, and no claim that copied-tree verification substitutes for a clean CI/staging run. External provider/device/staging acceptance remains outstanding.
