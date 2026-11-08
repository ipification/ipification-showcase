# Reading the authentication demo

Start with the method you want to integrate. The running demo uses the same frontend entry points described here; there is no separate simplified implementation to keep in sync.

## Where to start

1. [Showcase screen](../src/features/login/showcase.tsx): find `onClick={() => verification.startVerification(client)}`. The selected client comes from configuration.
2. [Verification entry points](../src/features/login/use-verification.ts): `startVerification` validates the selection, prevents duplicate activation, and selects the named method below.
3. Follow that method's request and callback path to [the result page](../src/app/user/info/page.tsx).

| Method | Function in `use-verification.ts` | Continue reading |
| --- | --- | --- |
| IP / IP+ | `startIpVerification` | `openBrowserVerification`, then backend `/auth/start` |
| IM | `startMessagingVerification` | `openBrowserVerification`, always direct navigation |
| SMS | `startSmsVerification` | [SMS dialog](../src/features/sms/sms-dialog.tsx) and [SMS requests](../src/features/sms/use-sms-flow.tsx) |
| SIM / TS43 | `startSimVerification` | [SIM requests and browser credential API](../src/features/ts43/use-ts43-flow.tsx) |
| Anonymous Identity / KYC | `startIdentityVerification` | `openBrowserVerification`; KYC includes the phone, Anonymous Identity omits it |

IP+ uses the same browser entry point as IP; the configured client/scope distinguishes the provider request. IP via App also uses that entry point, with its button offered only on mobile.

## Backend entry points

For the web flow, the [HTTP handlers](../src/server/auth/web.ts) and [application service](../src/server/auth/service.ts) use matching operation names. Start at one of these endpoints:

| Endpoint | Function to find | Responsibility |
| --- | --- | --- |
| `POST /auth/prepare` | `prepareWebAuthentication` | Create a browser-bound attempt (QR: two minutes to scan; direct: five minutes) and return its start URL |
| `GET /auth/status` | `getAuthenticationStatus` | Owner-bound recovery; exact-state authenticated session can report finished |
| `GET /auth/start` | `startWebAuthentication` | Select the configured client/server and build the provider authorization redirect |
| `GET /auth/callback/:userFlow/:serverId` | `handleAuthorizationCallback` | Exchange the code, save results, then return a redirect or QR/backchannel outcome |
| `GET /auth/complete` | `completeWebAuthentication` | Wait for the saved result and establish the browser's demo display session |
| `POST /auth/mobile/login` | `exchangeMobileCode` | Exchange the mobile app's code and submitted redirect URI, then return user info as JSON |
| `POST /auth/s2s/signin` | `readS2sResult` | Read the raw result previously cached by a callback using its `state` |

For request examples and a comparison of these endpoints, see [Mobile and S2S](nextjs/mobile-s2s.md).

Mobile HTTP response handling lives in [auth/mobile.ts](../src/server/auth/mobile.ts). This API creates no browser session. The existing response precedence allows a provider's `auth_server` field to take precedence over the locally selected server; provider failures retain this endpoint's HTTP 401 mapping.

[S2S signin](../src/app/auth/s2s/signin/route.ts) performs a non-consuming cache read, so callers can read the same stored result again while it remains available. It does not exchange a new authorization code or create a browser session; a cache miss returns an empty HTTP 401 response.

## Public configuration and country lookup

- [GET /api/config](../src/app/api/config/route.ts): `getPublicConfig` resolves the request context, then calls [toPublicConfig](../src/server/config/public.ts) to project the public response fields. Client secrets remain on the server. `redirect_uri` includes the default server id; `redirect_uris[serverId]` gives the matching callback for each configured server.
- [GET /api/geoip](../src/app/api/geoip/route.ts): `getClientCountry` uses the client IP resolved under the configured proxy policy. A GeoIP match wins; a miss or lookup failure keeps `default_country_code`, or `rs` when no default exists. The response returns the lowercase country and the selected IP.

These short handlers stay in their route files so customers can read the complete operation without another service layer.

## IP, IP+, IM, and Identity

`openBrowserVerification` keeps the browser flow together:

1. POST `/auth/prepare` with `user_flow`, `server_id`, `qr` and the normalized `phone` only for methods that require it.
2. Use the returned server-generated `state` and `/auth/start` URL. The response sets a per-attempt HttpOnly owner cookie; keep it in the initiating browser.
3. Continue in the same browser on mobile, or show a QR on desktop. IM always navigates directly, including on desktop.

For example, an IP phone-verification request has this shape (values below are placeholders):

```text
/auth/start?user_flow=pvn_ip&server_id=stage&state=<fresh-state>&phone=<normalized-number>
```

For QR attempts, the backend appends `-qrcode` to the state. The QR points at this app's `/auth/start` URL, not directly at a provider token endpoint.

The backend sequence is in [web handlers](../src/server/auth/web.ts), [authentication service](../src/server/auth/service.ts), and [provider requests](../src/server/auth/provider.ts):

```text
POST /auth/prepare
  -> /auth/start
  -> provider authorization
  -> /auth/callback/:userFlow/:serverId
  -> exchange authorization code and obtain user info on the server
  -> /auth/complete?state=...
  -> session-backed /user/info
```

With QR, the phone and desktop have separate browser sessions. [QrDialog](../src/features/qr/qr-dialog.tsx) uses [HTTP status polling](../src/features/qr/use-auth-polling.tsx) immediately and every two seconds. The QR is shown after the first successful pending status response. After the phone callback persists its result and terminal state in Redis, the desktop reads the matching completion URL and visits `/auth/complete`, which establishes its own display session. Completion URLs must use this app's origin, `/auth/complete`, and the exact attempt state. No Socket.IO connection is used.

Creating a new QR immediately disconnects the previous listener and cancels its status checks before preparing a new state. Preparation responses from cancelled/tab-switched attempts cannot reopen the dialog. QR links have two minutes to start from `/auth/prepare`; direct flows keep their five-minute attempt lifetime. The popup uses the prepare response's `expiresAt` for its scan countdown, including time spent preparing/loading. A successful first QR `/auth/start` atomically opens a separate five-minute completion window from that start. Owner-authenticated `/auth/status` returns `started` and the current `expiresAt`; the popup then hides the QR and displays a completion countdown. It keeps status recovery active across the scan deadline to handle a scan arriving just before expiry; the backend rejects an unstarted expired QR, and confirmed backend expiry stops recovery. Expired UI offers a new code. Visibility/focus updates recompute the remaining time after returning to a background tab. The provider can have its own expiry.

The start endpoint binds a separate callback cookie to the scanning browser. Callback claims and owner completion are atomic and single-use in Redis, bound to flow/server/client/origin and the originally submitted phone. Missing, duplicate, expired or replayed states fail before provider calls. Owner-authenticated `/auth/status` checks report pending, completed or failed attempts, including provider failures. Scanner cookies cannot establish the desktop session.

For a bound browser callback, a nonempty `error` is displayed first; if it is absent, `error_description` is displayed. When neither error parameter nor a nonempty `code` is present, the app displays `Unable to complete authentication.` No token exchange occurs for these cases. Messages are length-limited and common credential patterns and links are redacted; they are kept in the browser session (and the bound attempt for QR completion), not added to redirect URLs. The QR scanner and the browser that opened the QR receive their own session messages. State and callback binding checks still apply.

Messaging backchannels may omit the callback cookie only for `pvn_im`/`login_im` with a matching started state. In this exception the unpredictable state is a bearer credential and the authorization code is checked by token exchange; the header alone is insufficient. Backchannels never adopt browser sessions. If the browser returns while the backchannel is exchanging, `/auth/pending` waits through owner-authenticated status checks; an already completed backchannel result is reused without another exchange. This is not independent authentication of the backchannel sender.

Custom browser integrations must POST prepare first, retain cookies, and follow the returned URL. This does not alter the submitted-code mobile API or the separately signed Play Integrity protocol. PKCE and ID-token validation are outside this change. See [RFC 9700 section 4.7](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.7) for user-agent binding context.

## SMS: request code, submit code, show result

Read [useSmsFlow](../src/features/sms/use-sms-flow.tsx) from `start` to `submit`:

1. `POST /sms/auth`: send the selected `client_id`, `server_id`, normalized phone as `login_hint`, and scope.
2. Keep `auth_req_id` and `nonce` returned by the backend. [SmsDialog](../src/features/sms/sms-dialog.tsx) lets the user enter the OTP; [WebOTP](../src/features/sms/use-web-otp.tsx) can supply it on a supported browser.
3. `POST /sms/token`: submit the OTP together with the original request identifiers and client/server selection.
4. The existing demo logs the token response through `/sms/log`, then navigates to `/user/info` after a successful response. Wrong codes remain retryable in the dialog.

The [CIBA backend service](../src/server/ciba/service.ts) owns provider requests and session creation; client secrets never belong in React.

On the backend, follow `sendSmsCode` from [the HTTP handler](../src/server/ciba/handlers.ts) through the service to [the provider client](../src/server/ciba/provider.ts). It posts to `/ext/ciba/auth` with `channel=sms` and the configured message. Follow `verifySmsCode` through the same files to see OTP submission to `/ext/bc/sms/callback`, then `/token` with the CIBA grant, then `/userinfo`.

The callback submission is best-effort in the existing integration: even if it fails, the backend still attempts the token request. The token response determines the API outcome. The service creates a **demo display session** for both successful user info and error data, so a session alone does not prove that phone verification succeeded.

## SIM: request credential, obtain it, exchange it

Read [useTs43Flow](../src/features/ts43/use-ts43-flow.tsx) in its numbered order:

1. `POST /ts43/auth`: obtain `digital_request`, the request id, and nonce from the backend.
2. `navigator.credentials.get(...)`: ask a supported device/browser for the SIM credential.
3. `POST /ts43/token`: send the returned `vp_token`, request id, client id, nonce, and the same selected `server_id` to the backend.
4. The existing demo sends `/ts43/log`, then opens `/user/info` to display the session-backed response.

This path requires a supported device/browser; a desktop fake-provider test cannot prove real-device SIM support. The token request now preserves the auth request's selected server.

The backend entry points are `createSimCredentialRequest` and `exchangeSimCredential` in [handlers](../src/server/ciba/handlers.ts), [service](../src/server/ciba/service.ts), and [provider](../src/server/ciba/provider.ts). The first calls `/ext/ciba/auth`, then `/ext/bc/ts43/dcql`. The second submits `vp_token` to `/ext/bc/ts43/callback`, then exchanges the CIBA request at `/token` and fetches `/userinfo`. The callback and demo-session rules described for SMS also apply here.

## Optional mobile Play Integrity API

This is a backend/mobile flow; collecting the Android Integrity token is outside the React Showcase screen. Follow [the HTTP handler](../src/server/integrity/handlers.ts) to `execute` in [the Integrity service](../src/server/integrity/service.ts), then read its three named steps in order:

| Endpoint | Named step | Input / result |
| --- | --- | --- |
| `POST /api/play-integrity/attempt` | `createAttempt` | `phone_number`, `server_id` → `attempt_id`, `request_hash`, expiry |
| `POST /api/play-integrity/verify` | `verifyAttempt` | `attempt_id`, `integrity_token` → signed `state`, expiry |
| `POST /api/play-integrity/token-exchange` | `exchangeCode` | authorization `code`, signed `state` → `user_info` |

An attempt is claimed before verification; Google verification follows the configured incoming-hostname policy. A successful verification approves a transaction. Code exchange claims that transaction and uses its captured client credentials and redirect URI, then marks it consumed or failed. The [attempt implementation](../src/server/integrity/attempts.ts) and [Redis store](../src/server/store/integrity.ts) retain the single-use state transitions. The HTTP handler retains feature gating, its 16 KB request limit, and public error/status mapping.

## What is only Showcase presentation?

- [Showcase layout](../src/features/login/showcase-layout.tsx): logo, server selector, footer, About and consent UI.
- [Browser presentation](../src/features/login/use-showcase-browser.ts): mobile/desktop detection, country default via GeoIP, and keyboard-focus appearance.
- [Preferences](../src/features/login/use-preferences.tsx): selected tab/server and browser storage.
- [Phone input](../src/features/phone/phone-input.tsx): digits-only entry, country selection, number normalization, validation, and the stage-only Wonderland country. As in the legacy UI, typing is not capped at a country-specific valid length and nonempty input enables methods; `startVerification` still rejects invalid real-country numbers before any prepare/SMS/SIM request.
- [Result view](../src/features/results/result-view.tsx): full original userinfo JSON shown immediately, its copy button, and a short explanation of `phone_number_verified`. Boolean and string claim values are preserved, including false; extra/nested claims remain visible.

When adapting the React flow, retain the guards around duplicate activation and cancellation: late async responses must not affect a newer attempt. These small guards are commented where they are used.

The result page follows the legacy title → full userinfo → client id/state layout, with a short explanation below the JSON only when the original userinfo contains `phone_number_verified`. Its presence is checked explicitly, so boolean false still shows the explanation. It does not hide userinfo behind a disclosure or replace it with selected highlights. `true` / `"true"` indicates successful phone verification; `false` / `"false"` indicates it did not succeed, and missing/unknown values do not confirm it. The JSON and copied content keep the provider's original values and types.

The result page is a demo display of a session-backed response. Apply your own application's acceptance policy when integrating verification; the existing migration deliberately preserves the behaviors documented in the [compatibility ledger](NEXTJS_MIGRATION.md#compatibility-ledger). For phone verification, see the explicit true-only rule in [PNV integration guidance](nextjs/browser-flows.md).

## Small support endpoints

- [GET /auth/login/error](../src/app/auth/login/error/route.ts) reads and clears the session's login error once, so it is not shown repeatedly after refresh.
- [GET /auth/session-required](../src/app/auth/session-required/route.ts) redirects to `/`; [GET /](../src/app/route.ts) redirects to `/auth/login`.
- [GET /health/live](../src/app/health/live/route.ts) reports liveness. [GET /health/ready](../src/app/health/ready/route.ts) requires valid config and a successful Redis ping. These are service probes, not verification steps.
- [POST /sms/log](../src/app/sms/log/route.ts) and [POST /ts43/log](../src/app/ts43/log/route.ts) retain the existing diagnostics handler: it reads the body and acknowledges it with `OK`; it does not authenticate a user or call the provider.

## Checking your changes

From the repository root, use `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, then `npm run build` and `npm run test:e2e`. Browser tests use a fake provider and disposable Redis. In particular, `e2e/flow-routing.spec.ts` checks mobile IP, desktop IM, and Identity request parameters; the other suites check QR callbacks, OTP, SIM cancellation/retry, focus, and result display.

## Malformed provider token responses

Authorization-code and CIBA exchanges reject HTTP 200 token bodies that are null, arrays, or lack a nonempty string `access_token`. They stop before userinfo and classify friendly browser diagnostics as `TOKEN_RESPONSE_INVALID` at the token step. Raw responses and tokens are never added to these diagnostics. The existing SMS/SIM demo error-session behavior remains unchanged.


## Provider deadlines and status recovery

IPification form and JSON requests have a 15-second deadline per request, including connection and response waits. `PROVIDER_HTTP_TIMEOUT_MS` accepts an integer from 1 to 120000; absent or invalid values use 15000. Requests are never automatically retried, including authorization-code exchange. A timeout is shown as `PROVIDER_TIMEOUT` with a safe explanation and an action to start a new verification. CIBA callback submission remains best-effort: after failure or timeout, the existing token → userinfo sequence continues once. Google Integrity retains its existing timeout; SMS/SIM fixed scopes and debug requests remain unchanged.

QR and IM share status polling immediately and every 2000 ms, with one request at a time and a five-second browser request timeout. Network failures keep recovery active and show a connection message; IM offers Retry now. Polling stops on completion, confirmed expiry, local hard deadline or component cleanup. QR recovery is bounded by the original two-minute scan deadline plus the maximum five-minute completion window; a started response can shorten this to the authoritative completion deadline. IM waiting is bounded by five minutes and may expire earlier on a backend response. Completion URLs must belong to this origin, use `/auth/complete`, and contain the exact attempt state. A finished status opens `/user/info` without consuming completion again.

After completion clears the owner cookie, `/auth/status` can return `finished` only when the current authenticated session's stored valid state exactly matches the requested state. This does not create or adopt another session, and all other states still require owner binding.


## Incoming origin

Both development and production always detect the public origin from each request. Direct access uses the request host and protocol. With `TRUST_PROXY_HOPS=1` behind one trusted ingress, the forwarded host and protocol are used, so an HTTPS ingress can forward internal HTTP without producing HTTP callbacks. Ingress owns domain routing; no application domain list is needed. Keep the ingress forwarded-header handling and existing network access policy in place.

QR URLs, public callback URLs, provider redirect URIs and Secure cookie selection follow this origin. Each authentication attempt captures its original origin; continue that attempt on the same domain. Each public callback URL still needs provider registration. For mobile QR testing, open the desktop app through its LAN IP or a shared domain: localhost in a QR points to the phone itself.

`npm run dev` prints localhost and deduplicated LAN IPv4 login URLs with the configured port, plus the same-network QR instruction. With no LAN IPv4, it prints a connect/restart hint. Production startup does not print the LAN guide.
