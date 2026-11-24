# Showcase modules and client flows

This folder groups the HTTP endpoints by the integration flow they serve.
Routes connect an HTTP path to a controller; controllers handle HTTP input and
responses; services coordinate the flow; `src/shared/server` contains protocol,
session, and storage code reused by more than one module.

## Choose a flow

| Client goal | Module | Start here | Result |
| --- | --- | --- | --- |
| Sign in through a browser and return to the Showcase | `browser-auth` | `POST /auth/prepare` | Browser display session at `/user/info` |
| Exchange a mobile authorization code | `mobile` | `POST /auth/mobile/login` | Provider claims in the response |
| Read a browser login result from a backend | `s2s` | `POST /auth/s2s/signin` | One-time provider claims for the browser attempt's `state` |
| Verify a phone with an SMS challenge | `sms` | `POST /sms/auth` | Challenge ID and nonce; submit the code to `/sms/token` |
| Verify a SIM credential | `sim` | `POST /ts43/auth` | Digital request; submit its credential to `/ts43/token` |
| Verify an Android Play Integrity token | `play-integrity` | `POST /api/play-integrity/attempt` | Attempt, then signed state, then exchanged user claims |
| Render Showcase pages or read its public configuration | `showcase` | `GET /auth/login` or `GET /api/config` | HTML page or public JSON |

## Browser authorization

1. `POST /auth/prepare` validates the request, creates a server-side attempt,
   and returns a state and `/auth/start` URL. The initiating browser receives
   an owner cookie.
2. Open the returned URL. `/auth/start` checks the attempt and redirects to the
   provider. For QR, the scanning phone is a separate browser and receives its
   own callback binding.
3. The provider calls `/auth/callback/:userFlow/:serverId`. The server claims
   the attempt once, exchanges the code, stores claims, and marks the attempt
   complete. IM backchannel callbacks can arrive before the browser callback;
   the browser then waits for the stored result.
4. The owner browser polls `GET /auth/status?state=...`. When `completionUrl`
   is present, follow it to claim the result and create a display session.
5. The browser lands on `/user/info`. A backend can separately read the same
   attempt's result once through `POST /auth/s2s/signin` with the state.

QR keeps the same prepare/start/callback sequence, but the phone that scans the
QR completes the provider interaction. The original browser owns the attempt
and claims the completed result. `browser-auth/attempts.ts` enforces these
ownership, expiry, and single-use transitions.

## SMS and SIM

Both modules use the shared CIBA service in `src/shared/server/ciba`:

1. Call the module's `.../auth` endpoint to send an SMS challenge or create a
   SIM credential request.
2. Keep the returned `auth_req_id` and `nonce` for that request. For SIM, also
   pass `digital_request` to a browser that supports the credential protocol.
3. Submit the OTP to `/sms/token` or the credential to `/ts43/token`.
4. The server exchanges the response with the provider and returns its claims.
   The Showcase may also set a display-session cookie for the result page.

`sms` and `sim` keep endpoint-specific input, rate limiting, and response
choices in their controllers. Shared provider calls and demo display-session
behavior stay in `src/shared/server/ciba`.

## Play Integrity

This optional Android flow uses three endpoints in order:

1. `/api/play-integrity/attempt` creates a short-lived attempt and a request
   hash for the submitted phone number, client, and server.
2. The Android client obtains an integrity token bound to that request hash and
   sends it to `/api/play-integrity/verify`. The server verifies Google's
   verdict and returns a short-lived signed state only when policy allows it.
3. `/api/play-integrity/token-exchange` accepts the authorization code and
   signed state, claims the transaction once, then exchanges the code using
   credentials and redirect URI captured at attempt creation.

## Showcase and mount order

`showcase` serves the home redirect, login/pending pages, health checks, public
configuration, GeoIP suggestion, and result/error pages. `src/app.ts` mounts
these routes before feature APIs and serves static assets before the result-page
router. Keep this order in mind when adding a route that may overlap a static
path.
