# Verify a phone number with SMS

[Documentation home](../README.md) · [Showcase HTTP reference](../reference/http.md)

The showcase uses a CIBA request to send an OTP, then submits it and requests userinfo. Enable a `pvn_sms` client with provider-issued credentials and an authorized scope. The browser never receives the client secret.

1. The browser sends the showcase `POST /sms/auth` with `client_id`, `server_id`, `login_hint` and `scope`.
2. The backend sends the provider `/ext/ciba/auth` request with `channel=sms` and receives `auth_req_id`. The showcase returns that ID and a generated `nonce` to the browser.
3. The user enters the OTP. The browser sends `POST /sms/token` to the showcase with `code`, `auth_req_id`, `nonce`, `client_id` and `server_id`.
4. The backend submits the code to the provider `/ext/bc/sms/callback`, exchanges `auth_req_id` at `/token` using the CIBA grant, and requests `/userinfo`.

Example requests to the **showcase**:

```http
POST /sms/auth HTTP/1.1
Content-Type: application/json

{"client_id":"<client-id>","server_id":"stage","login_hint":"+<country-code><number>","scope":"openid ip:phone_verify"}
```

```http
POST /sms/token HTTP/1.1
Content-Type: application/json

{"client_id":"<client-id>","server_id":"stage","auth_req_id":"<id-from-start>","nonce":"<nonce-from-start>","code":"<user-entered-otp>"}
```

A successful start returns `auth_server`, `auth_req_id`, and `nonce`; successful token exchange returns `auth_server` plus provider userinfo. The demo handles callback submission on a best-effort basis and still attempts token exchange after callback failure. This describes current behavior, not a recommendation for every integration. HTTP failures may be JSON or text. Check the response and verification claims; the demo can create a display session even on token error. Do not log OTPs or secrets.

[SMS UI](../../src/features/sms/use-sms-flow.tsx) → [CIBA handlers](../../src/server/ciba/handlers.ts) → [service](../../src/server/ciba/service.ts) → [provider requests](../../src/server/ciba/provider.ts). The tests use a mock provider.
