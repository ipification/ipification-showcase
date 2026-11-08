# SIM credential / TS43

[Documentation home](../README.md) · [Showcase HTTP reference](../reference/http.md)

The showcase supports `pvn_sim` and `login_sim`. It shows a configured SIM option only when `DigitalCredential.userAgentAllowsProtocol("openid4vp-v1-unsigned") === true`. Missing API, false, or a failed capability check leaves the option hidden. Successful use also depends on the device, browser, carrier, provider configuration and an eligible SIM credential. [Capability detection](../../src/features/login/use-showcase-browser.ts)

1. The browser calls showcase `POST /ts43/auth` with `client_id`, `server_id`, `login_hint`, `carrier_hint`, `scope` and optionally `operation`.
2. The backend calls provider `/ext/ciba/auth` and `/ext/bc/ts43/dcql`, returning `auth_req_id`, `nonce` and `digital_request`.
3. The browser passes `digital_request` to `navigator.credentials.get`, then extracts the IPification `vp_token`.
4. The browser sends that token, request ID and nonce to showcase `POST /ts43/token`. The backend submits `/ext/bc/ts43/callback`, exchanges the CIBA request at `/token` and requests `/userinfo`.

Example start request to the **showcase**:

```http
POST /ts43/auth HTTP/1.1
Content-Type: application/json

{"client_id":"<client-id>","server_id":"stage","login_hint":"anonymous","carrier_hint":51010,"scope":"openid ip:phone","operation":"GetPhoneNumber"}
```

For a successful start response, the showcase's browser-side credential step is equivalent to:

```js
// `started` is the successful JSON response from POST /ts43/auth.
const credential = await navigator.credentials.get({
  digital: { requests: [started.digital_request] },
});
const data = credential?.token || credential?.data;
const vpToken = data?.vp_token?.['ipification.com']?.[0];
if (!vpToken) throw new Error('No supported SIM credential');
const response = await fetch('/ts43/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    client_id: '<client-id>', server_id: 'stage',
    auth_req_id: started.auth_req_id, nonce: started.nonce, vp_token: vpToken,
  }),
});
if (!response.ok) throw new Error('SIM verification failed');
const result = await response.json();
```

This snippet illustrates showcase endpoints. Check capability and handle cancellation before using the credential API, and do not log the returned token.

The `carrier_hint` above is the demo's current fixed value, not a general value for your deployment. For PNV the demo uses the entered phone and `openid ip:phone_verify`; Login uses `anonymous`, `openid ip:phone` and `GetPhoneNumber`. Successful start returns `auth_server`, `auth_req_id`, `nonce`, and `digital_request`; `/ts43/auth` can return 429 with `Retry-After`.

Handle unsupported/cancelled credentials, provider errors and expired attempts. The showcase submits the callback best-effort and can create a display session on token failure; its UI currently navigates to the result page even when `/ts43/token` returns an error. A client integration should explicitly check the HTTP response and provider result rather than infer success from the session. [SIM UI](../../src/features/ts43/use-ts43-flow.tsx) · [Provider requests](../../src/server/ciba/provider.ts) · [Handler](../../src/server/ciba/handlers.ts)
