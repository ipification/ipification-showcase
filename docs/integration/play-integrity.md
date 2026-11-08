# Optional Android Play Integrity flow

[Documentation home](../README.md) · [Showcase HTTP reference](../reference/http.md)

The showcase offers an optional backend demonstration that binds an Android integrity request to an IPification code exchange. It is disabled unless `PLAY_INTEGRITY_ENABLED=true`. This is a showcase API and is separate from the browser UI flow. The backend uses a short-lived immutable attempt and a single-use transaction. [Service](../../src/server/integrity/service.ts) · [Attempts](../../src/server/integrity/attempts.ts)

## Configure

Enabling the feature requires `PLAY_INTEGRITY_PACKAGE_NAME`, `PLAY_INTEGRITY_USER_FLOW`, `PLAY_INTEGRITY_STATE_SECRET`, `PLAY_INTEGRITY_STATE_ISSUER` and `PLAY_INTEGRITY_STATE_AUDIENCE`; missing values make runtime configuration invalid. Select a `PLAY_INTEGRITY_USER_FLOW` present in the configured clients. `PLAY_INTEGRITY_REQUIRE_LICENSED_APP=true` adds the licensing requirement. The backend also needs Google Application Default Credentials when Google verification is performed; configure the matching Android app and project. Keep state secrets and service-account credentials outside the repository. [Runtime configuration](../../runtime/config.mjs) · [Composition root](../../src/server/integrity/runtime.ts)

**Verification boundary:** `play_integrity_verify_domains` in `config/default.json` determines which request hostnames trigger a Google verdict check. A hostname absent from this list bypasses that check; an empty list bypasses it for all hostnames. The demo still creates and claims an attempt, but bypass is not a Google integrity verdict. Configure the exact public host and verify your deployment policy before relying on it. [Domain decision](../../src/server/integrity/service.ts)

## Request sequence

1. Send `POST /api/play-integrity/attempt` with `phone_number` and configured `server_id`. A 201 response contains `attempt_id`, `request_hash` and `expires_at`.
2. On Android, request a fresh Standard Integrity token using the **exact returned request hash**. Send it once to `POST /api/play-integrity/verify` with `attempt_id` and `integrity_token`. A successful 201 response contains a signed `state` and `expires_at`.
3. Pass the returned state into your IPification authorization flow. Send the returned authorization `code` and the same signed `state` to `POST /api/play-integrity/token-exchange`. On success, the showcase returns `{ "decision": "allow", "user_info": { ... } }`.

```http
POST /api/play-integrity/attempt HTTP/1.1
Content-Type: application/json

{"phone_number":"+<country-code><number>","server_id":"stage"}
```

```http
POST /api/play-integrity/verify HTTP/1.1
Content-Type: application/json

{"attempt_id":"<attempt-id>","integrity_token":"<fresh-android-token>"}
```

```http
POST /api/play-integrity/token-exchange HTTP/1.1
Content-Type: application/json

{"code":"<authorization-code>","state":"<signed-state>"}
```

The attempt expires after 120 seconds; verification and transaction exchange are claimed once. Invalid input returns 400, conflicts 409, policy denial 403, unavailable dependencies 503 and exchange failures 401. Disabled endpoints return 404. Do not log integrity tokens, signed state, codes or userinfo. The demo uses process-local memory: restart loses attempts and separate processes do not share them. A real multi-instance service needs shared storage with atomic claims and an access-control policy appropriate to its users. [Input validation](../../src/server/integrity/input.ts) · [Response mapping](../../src/server/integrity/handlers.ts) · [Verifier](../../src/server/integrity/verifier.ts)

Automated tests use fixtures or mocks; they do not prove a live Google Play configuration, Android device verdict or real IPification carrier flow. [Service tests](../../tests/services/integrity.test.ts) · [HTTP tests](../../tests/contracts/integrity.test.ts)
