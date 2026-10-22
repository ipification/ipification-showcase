# Auth Route Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make authentication code easier to follow while preserving existing HTTP, cache, session, and socket behavior.

**Architecture:** Keep `routes/auth.js` as the route table. Move HTTP coordination into web/API handlers, provider request construction into `authService`, and cache conventions into `authResultStore`.

**Tech Stack:** CommonJS, Express 5, cache-manager, node:test, Node 24.22.0.

**Spec:** [Approved design](../specs/2026-10-21-auth-route-structure-design.md).

## Global Constraints

- Work on `refactor/auth-route-structure` in the existing checkout.
- Node.js >=24.0.0; verify on Node 24.22.0; add no dependencies.
- Preserve all eight endpoint registrations and their order, status codes, response bodies, logging, and exception boundaries.
- Preserve cache key format, default TTL, read behavior, and sequential writes before socket notification or HTTP success.
- Preserve backchannel precedence over QR, string `'false'` comparison, special IPificator URL, and callback redirect URI construction.
- Preserve five reads and five sleeps on a complete polling miss; do not fix existing quirks in this refactor.
- Update `docs/ARCHITECTURE.md`. Leave implementation uncommitted for review; do not push.

## Review Focus

- Backchannel request with QR state must store both results and emit no socket event.
- A second cache write failure must prevent socket emission and success redirect.
- Mobile userinfo containing `auth_server` must retain the existing response spread precedence.
- QR userinfo with boolean `false` must retain its existing behavior, distinct from string `'false'`.
- Missing completion state must read the empty-string key and retain the existing polling schedule.

## Task 1: Characterize the existing router

**Files:** Create `test/routes/authFlows.test.js`; retain `test/routes/authSecurity.test.js`.

**Interfaces:** Consume the existing exported router and singleton `lib/data_store`. The test fixture mounts the real router with Express/session/body parsers, fixed local server/client configuration, and a local fake provider serving token and userinfo POST endpoints. It supplies a fake socket object and a test-only session inspection endpoint. Use unique state per test and restore any patched cache methods after each case.

- [x] Run the existing `npm test` baseline on Node 24.22.0 with loopback access.
- [x] Add HTTP characterization cases for `/start`: default and explicit servers, all authorization fields, optional channel/login hint, absent state, unknown client/server, and IPificator URL. Assert nonce has UUID shape and consent timestamp lies between timestamps captured around the request.
- [x] Add web callback cases: provider form bodies, formatted result/session data, complete redirect, provider failure, mapped provider errors, and absent callback state generating a UUID.
- [x] Add QR cases for success, string `'false'`, boolean `false`, and QR suffix occurring inside the state. Assert event room/name/payload and capture cache writes followed by the socket event. Add a failing second write case that asserts 400 and no event.
- [x] Add backchannel/S2S cases: empty 200 with QR state and no event; raw userinfo available via S2S; missing S2S state/result returns 401.
- [x] Add mobile cases: successful provider exchange using request redirect URI/client ID, unknown server 400, unknown client 401, provider failure 401, and provider userinfo `auth_server` overriding the initially supplied server field.
- [x] Run `node --test test/routes/authFlows.test.js test/routes/authSecurity.test.js` against the original router. These are characterization tests and should pass before any extraction. Assert actual HTTP responses and stored/session data, not just calls to mocks.

## Task 2: Extract provider and storage responsibilities

**Files:** Create `services/authService.js`, `services/authResultStore.js`, `test/services/authService.test.js`, and `test/services/authResultStore.test.js`; modify `routes/auth.js` to consume these services before moving its handlers.

**Interfaces:**
- `buildAuthorizationUrl({ client, baseUrl, userFlow, server, realm, state, phone }) -> string`.
- `exchangeAuthorizationCode({ server, realm, clientId, clientSecret, redirectUri, code }) -> Promise<{ tokenInfo, userInfo }>` delegates to the unchanged `utils/httpClient.js`.
- `saveResult(state, response, userInfo) -> Promise<void>` writes the two existing keys sequentially.
- `waitForResult(state) -> Promise<object | undefined>` preserves lookup fallback, retries, and sleeps.
- `getUserInfo(state) -> Promise<object | undefined>` reads `${state}-user-info`.
- Storage module additionally exports `createAuthResultStore({ dataStore, delay })` returning these three methods. Its default export properties use the existing singleton cache and delay helper. This factory supports deterministic storage tests without changing production defaults.

- [x] Write service tests first. For authorization URL assert the exact provider path, callback path and query values, including the IPificator exception. For exchange use a local provider to assert the posted grant/client/redirect/code fields and returned token/userinfo objects. Verify the new module tests fail because the service modules do not exist yet.
- [x] Write storage tests using a real Map-backed test store and recorded operations. With `response` and `userInfo` fixtures, assert `saveResult('s', response, userInfo)` yields operations `[['set', 's', response], ['set', 's-user-info', userInfo]]`. Reject the first write and assert the second never occurs. Assert `getUserInfo('s')` returns the raw fixture without deleting it.
- [x] Test immediate, delayed, and missed polling through the factory: immediate hit has one read/no delay; a hit on read three has two delays; total miss has five reads and five `delay(1000)` calls. Missing state produces five reads of `''`. Verify these tests fail before implementing the storage module.
- [x] Implement both services using the existing logic. Keep HTML formatting in the route handler. Change callback/mobile to use the explicit exchange interface, preserving their different `clientId` and redirect URI sources. Keep original logging inside the same try/catch regions.
- [x] Run both new service test files, both auth route test files, and then the complete `npm test` suite. Investigate any changed HTTP/side-effect behavior before proceeding.

## Task 3: Move handlers and document the final flow

**Files:** Create `routes/auth/webHandlers.js` and `routes/auth/apiHandlers.js`; reduce `routes/auth.js` to registrations; update `docs/ARCHITECTURE.md`.

**Interfaces:** Web module exports `{ login, start, callback, complete, qrComplete, qrError }`; API module exports `{ s2sSignin, mobileLogin }`. Each handler retains `(req, res)` and its original sync/async behavior. Consume the services from Task 2; router's public export remains the same Express router instance shape.

- [x] Move handlers without changing branch conditions, lookup order, session writes, error responses, or exception boundaries. Keep `handleQrCodeCallback` and result formatting inside the web module. Remove unused `debug` import. Use consistent function names matching the exports above.
- [x] Register the eight handlers in their existing order. Replace obsolete QR comments with the actual flow: provider exchange, cache writes, socket notification, desktop completion/session assignment. Preserve the mobile and backchannel distinctions.
- [x] Update the auth module section of `docs/ARCHITECTURE.md` with the four new modules, the full callback path `GET /auth/callback/:userFlow/:serverId`, both QR page routes, and the actual callback/complete responsibilities.
- [x] Run the complete `npm test` suite on Node 24.22.0, `git diff --check`, and inspect `git diff --stat` plus every production diff. Verify only routing, handler placement, provider construction, and result storage changed. Report test count, branch, and any external boundaries; no commit or push.

## Plan self-review

The tasks cover each approved module and all seven validation groups in the spec. The five review-focus conditions map to Tasks 1 and 2. The only additional exported interface is the storage factory required for fast deterministic retry tests; its default singleton preserves runtime wiring. Characterization tests pass on the original router; the new service contract tests provide the failing-first gate for extraction. No new authentication policy, cache schema, retry schedule, or public HTTP interface is introduced.
