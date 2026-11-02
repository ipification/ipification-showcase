# Browser authorization: PNV, Login and Identity

[Guide home](README.md) · [QR](qr.md) · [Endpoint reference](api.md)

## Methods and inputs

| Screen | Configured `user_flow` values | Showcase behavior |
| --- | --- | --- |
| PNV | `pvn_ip`, `pvn_ip_plus`, `pvn_im`, `pvn_ipificator` | Requires the entered phone; passes it as `login_hint` |
| Login | `login_ip`, `login_ip_plus`, `login_im` | Does not ask for a phone |
| Identity | `anonymous`, `kyc_phone` | Anonymous omits the phone; KYC requires it |

SIM and SMS use separate [SIM](sim.md) and [SMS](sms.md) paths. Availability, client ID, scope, channel and server are configuration-dependent; IP and IP+ use the same redirect machinery with their own configured client and scope. IP via App uses the special IPificator authorization endpoint and is offered on mobile by the showcase. IM navigates directly, including on desktop; other supported desktop browser methods use QR. See [flow catalog](../../src/shared/flow-catalog.ts) and [frontend entry points](../../src/features/login/use-verification.ts).

## PNV via IP: end to end

```mermaid
sequenceDiagram
    participant B as Browser
    participant S as Showcase backend
    participant I as IPification
    B->>S: POST /auth/prepare (pvn_ip, phone, qr=false)
    S-->>B: state, start URL, owner cookie
    B->>S: GET start URL
    S-->>B: redirect to authorization URL
    B->>I: authorize with state and login_hint
    I-->>B: redirect to callback with state and code or error
    B->>S: GET /auth/callback/pvn_ip/{serverId}
    S->>I: POST token, then POST userinfo
    S-->>B: redirect through /auth/complete
    B->>S: GET /user/info using display session
```

1. Configure an auth server and a `pvn_ip` client with the provider-issued credentials and scope. Register the exact callback for the origin and server being used: `{origin}/auth/callback/pvn_ip/{serverId}`.
2. The browser submits a normalized phone in `phone` to the showcase. The demo creates an attempt and an HttpOnly owner cookie. Both the cookie and `state` must remain available to the initiating browser.
3. `/auth/start` builds the provider authorization request with `response_type=code`, `client_id`, `redirect_uri`, configured `scope`, `state`, a nonce, and, when present, `login_hint` and configured `channel`.
4. On callback the backend validates its attempt binding. A provider error is handled as an error; without an error, a code is required. It exchanges the code server-side with the same redirect URI, then retrieves userinfo. Never exchange the code with a client secret in browser code.
5. The showcase stores the result and creates a display session. `/user/info` shows returned userinfo; fields depend on the provider and granted scope.

Minimal browser example **for this showcase**, executed on its own origin:

```js
const response = await fetch('/auth/prepare', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'same-origin',
  body: JSON.stringify({
    user_flow: 'pvn_ip', server_id: 'stage',
    phone: '+<country-code><number>', qr: false,
  }),
});
if (!response.ok) throw new Error('Could not prepare authentication');
const { url } = await response.json();
window.location.assign(url);
```

For your own backend, the provider exchange is conceptually a form POST (do not expose its response or credentials to the browser):

```js
const form = new URLSearchParams({
  grant_type: 'authorization_code', code,
  client_id: clientId, client_secret: clientSecret, redirect_uri: callbackUrl,
});
const tokenResponse = await fetch(`${oidcRoot}/token`, { method: 'POST', body: form });
if (!tokenResponse.ok) throw new Error('Token exchange failed');
const { access_token } = await tokenResponse.json();
if (!access_token) throw new Error('Missing access token');
const userResponse = await fetch(`${oidcRoot}/userinfo`, {
  method: 'POST', body: new URLSearchParams({ access_token }),
});
if (!userResponse.ok) throw new Error('Userinfo request failed');
const userInfo = await userResponse.json();
```

Here `oidcRoot` is `{server.url}/realms/{realm}/protocol/openid-connect`. This illustrates the provider calls in the showcase; it omits the required secure callback/state/session management. See [provider](../../src/server/auth/provider.ts) and [HTTP client](../../src/server/shared/http-client.ts).

## Read the result correctly

Preserve the provider's userinfo response. `phone_number_verified` can be absent; absence is not a positive verification. If present, use the provider's documented type and meaning; the demo displays explanatory text whenever the field is present, including guidance for `true`, `false`, and other values. A demo display session alone is not proof of phone verification. The caller must apply its own verification policy to the provider result.

On provider `error` or `error_description`, the demo shows an error; if none and no code is supplied, it shows a generic failure. A code may be single-use: start a new attempt after a failed/expired flow instead of replaying a callback. Provider or network timeouts can also fail the exchange. Never put raw codes, tokens or sensitive userinfo into logs or shareable URLs.
