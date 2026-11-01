# PNV via SMS

[Guide home](README.md) · [Showcase endpoints](api.md)

SMS uses a CIBA request to send a one-time code. Configure the provider server and a `pvn_sms` client with credentials and an authorized scope. The showcase asks for a normalized phone number; no client secret is sent to the browser.

1. Browser calls showcase `POST /sms/auth` with `client_id`, `server_id`, `login_hint` and `scope`.
2. Showcase calls the provider's `/ext/ciba/auth` with `channel=sms`; on success it returns `auth_req_id` and `nonce` to the browser.
3. User enters the OTP. Browser calls `POST /sms/token` with `code`, `auth_req_id`, `nonce`, `client_id`, and `server_id`.
4. Showcase submits the OTP to provider `/ext/bc/sms/callback`, exchanges `auth_req_id` at `/token` with the CIBA grant, and calls `/userinfo`. A successful response includes provider userinfo; `/user/info` uses the display session.

```js
async function post(path, body) {
  const response = await fetch(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin', body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error('SMS request failed');
  return response.json();
}
const client_id = '<configured-client-id>', server_id = 'stage';
const attempt = await post('/sms/auth', {
  client_id, server_id, login_hint: '+<country-code><number>',
  scope: 'openid ip:phone_verify',
});
// Collect the code from the user; keep it out of logs.
const result = await post('/sms/token', {
  client_id, server_id, auth_req_id: attempt.auth_req_id,
  nonce: attempt.nonce, code: '<user-entered-otp>',
});
```

These are showcase endpoints, not provider endpoints. The demo submits the provider callback on a best-effort basis and still attempts token exchange after callback failure; that is current behavior, not a general integration recommendation. Error responses are not always JSON (for example a missing client may return text), so production clients should handle both. The showcase can create a display session even on token failure; check the HTTP response and provider result, not session existence. If the code fails or expires, show a useful error and start a new attempt when necessary.

`/sms/log` is a debug endpoint used by the demo, not a required provider step. Avoid sending it sensitive data in integrations. See [browser SMS flow](../../src/features/sms/use-sms-flow.tsx), [CIBA service](../../src/server/ciba/service.ts), and [provider requests](../../src/server/ciba/provider.ts).
