# SIM / TS43

[Guide home](README.md) · [Showcase endpoints](api.md)

The showcase supports `pvn_sim` for an entered phone and `login_sim` for obtaining a number. The flow requires an eligible carrier, device and browser supporting the digital credential request; selecting SIM does not guarantee support. Configure the appropriate client and provider credentials.

1. Browser calls `POST /ts43/auth` with `client_id`, `server_id`, `login_hint`, `carrier_hint`, `scope`, and optionally `operation`. In the current demo PNV uses the phone and `openid ip:phone_verify`; Login uses `anonymous`, `openid ip:phone` and `GetPhoneNumber`. The demo currently sends `carrier_hint: 51010`; do not assume that value is suitable for your deployment.
2. The showcase calls provider `/ext/ciba/auth`, then `/ext/bc/ts43/dcql`, returning `auth_req_id`, `nonce` and `digital_request`.
3. A supported browser receives that request through `navigator.credentials.get`. The demo extracts `vp_token` from `credential.token` or `credential.data` under `vp_token['ipification.com'][0]`.
4. Browser sends the credential and request identifiers to `POST /ts43/token`. The backend submits it to provider `/ext/bc/ts43/callback`, calls `/token` with the CIBA grant, then calls `/userinfo`.

```js
// `started` is the successful JSON response from showcase POST /ts43/auth.
if (!navigator.credentials?.get) throw new Error('SIM is unavailable');
const credential = await navigator.credentials.get({
  digital: { requests: [started.digital_request] },
});
const data = credential?.token || credential?.data;
const vpToken = data?.vp_token?.['ipification.com']?.[0];
if (!vpToken) throw new Error('No supported SIM credential');
const response = await fetch('/ts43/token', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  credentials: 'same-origin',
  body: JSON.stringify({
    vp_token: vpToken, auth_req_id: started.auth_req_id, nonce: started.nonce,
    client_id: '<configured-client-id>', server_id: 'stage',
  }),
});
if (!response.ok) throw new Error('SIM verification failed');
const userInfo = await response.json();
```

`/ts43/auth` is rate limited and may return 429 with `Retry-After`. Handle unavailable/cancelled credentials, provider errors and expired attempts. The demo submits the callback best-effort before token exchange; its display session can hold error data, so do not equate session existence with verification success. The demo currently navigates to its result page even if `/ts43/token` returned an error; integrations should check the response explicitly, as above. `/ts43/log` is diagnostic only and should not receive sensitive data.

See [SIM browser flow](../../src/features/ts43/use-ts43-flow.tsx), [CIBA handler](../../src/server/ciba/handlers.ts), and [provider requests](../../src/server/ciba/provider.ts).
