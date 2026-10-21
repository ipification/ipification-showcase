# Auth route structure

## Goal and scope

Make the existing authentication flow easier to read by separating route registration, HTTP handlers, authentication requests, and result storage. This implements the structure approved in conversation. Preserve all current externally observable behavior; this is not an authentication policy change.

Work on branch `refactor/auth-route-structure`. Use the existing checkout as requested; do not create a separate worktree. Require Node.js >=24.0.0 and verify with Node 24.22.0. Add no dependencies.

## Module responsibilities

| File | Responsibility |
| --- | --- |
| `routes/auth.js` | Register the same eight routes in their existing order and export the Express router. |
| `routes/auth/webHandlers.js` | Export `login`, `start`, `callback`, `complete`, `qrComplete`, and `qrError`; read request inputs, resolve server/client, render or redirect, update sessions, and notify QR clients. |
| `routes/auth/apiHandlers.js` | Export `s2sSignin` and `mobileLogin`; retain their current HTTP responses and error handling. |
| `services/authService.js` | Export `buildAuthorizationUrl({ client, baseUrl, userFlow, server, realm, state, phone })` and async `exchangeAuthorizationCode({ server, realm, clientId, clientSecret, redirectUri, code })`. Build authorization parameters and provider URLs, and delegate the exchange to the existing HTTP client. No Express objects or cache access. |
| `services/authResultStore.js` | Export async `saveResult(state, response, userInfo)`, `waitForResult(state)`, and `getUserInfo(state)`. Encapsulate the existing singleton data store and its key/retry conventions. No HTML formatting or HTTP responses. |

Keep client/server resolution and endpoint-specific error responses in handlers. Keep `prettyHtml` in the web handler so the storage service only stores supplied data. Keep QR response selection as a small named helper in `webHandlers.js` rather than adding another module. Remove the unused `debug` import while moving code.

## Preserved behavior

- Keep `/auth/login`, `/auth/start`, `/auth/callback/:userFlow/:serverId`, `/auth/complete`, both QR result pages, `/auth/s2s/signin`, and `/auth/mobile/login` unchanged, including methods and registration order.
- Preserve default server selection, lookup order, callback error mapping, missing-state behavior, and the special `pvn_ipificator` authorization URL.
- Preserve authorization query fields, nonce generation, consent timestamp, optional channel/phone, and environment defaults.
- Preserve the exchange parameters. The callback constructs its redirect URI using the resolved server ID; mobile login uses the request's redirect URI and client ID.
- Preserve HTML formatting, result shape, and session assignments. Store the formatted response under `state`, then raw userinfo under `${state}-user-info`, with the existing default TTL. Do not delete entries on read.
- Finish both cache writes before selecting a response. Backchannel takes precedence over QR and returns the existing empty 200 response. QR emits to `auth:${state}` with event `messages` and payload `{ event_name: 'url', url }`, then redirects to the existing result page. Ordinary web callbacks redirect to `/auth/complete?state=...`.
- Preserve the exact QR predicate and comparison against the string `'false'`; boolean `false` currently behaves differently and must not be silently changed.
- Preserve polling: `MAX_RETRY_ATTEMPTS = 4` means up to five reads and five delays on a complete miss, including the last delay. Missing state uses the empty-string lookup in `/complete`.
- Preserve all status codes, response types, error bodies, logging, and exception boundaries. Do not normalize web/mobile errors during extraction.

## Validation

Add characterization tests against the current router before moving code. Use local HTTP endpoints for provider token/userinfo responses and the real memory cache, isolating each test with unique state. Record cache writes and socket events where necessary to assert ordering; avoid external provider access and real credentials.

Cover:

1. Authorization redirects, default/explicit server choice, optional parameters, special IPificator URL, and existing invalid-server/client/state responses.
2. Successful web callback followed by completion, including session data and formatted userinfo; preserve callback exchange failure responses.
3. QR success/error destinations, socket room/payload, both cache writes preceding notification, and backchannel precedence over QR.
4. Empty backchannel response with stored results subsequently available through S2S; S2S cache miss remains 401.
5. Mobile login success, request redirect URI, response merge order, and invalid server/client/provider failure statuses.
6. Completion polling for immediate hit, delayed hit, and total miss. Use fake time or an injected sleep dependency in the storage service tests to avoid waiting five seconds; keep production defaults identical.
7. Existing callback error/session behavior from `test/routes/authSecurity.test.js`.

Run the whole `npm test` suite on Node 24.22.0 after extraction and run `git diff --check`. Compare the final callback side-effect order against the original source. Update the auth module section of `docs/ARCHITECTURE.md`, including the full callback path and the new module responsibilities.

## Delivery boundaries

No API redesign, cache schema/TTL changes, logging policy changes, retry fixes, or dependency upgrades. Leave implementation changes uncommitted for review unless the user requests a commit. Do not push. This design document may be committed separately as required by the design workflow.
