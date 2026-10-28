# SMS Verification Flow

> A separate Next.js application is being migrated in `showcase-next/`. See the [migration guide](NEXTJS_MIGRATION.md) for its runtime configuration, commands, compatibility limits and verification. The existing Express application remains available.


Guide for implementing SMS-based phone number verification using CIBA (Client-Initiated Backchannel Authentication) with an OTP code.

## Table of Contents

- [What is the SMS flow?](#what-is-the-sms-flow)
- [Quick Setup](#quick-setup)
- [How to Use](#how-to-use)
- [Configuration](#configuration)
- [Frontend Integration](#frontend-integration)
- [Technical Details](#technical-details)
- [API Endpoints](#api-endpoints)
- [Troubleshooting](#troubleshooting)
- [Related Documentation](#related-documentation)

---

## What is the SMS flow?

The SMS flow uses **CIBA with channel `sms`** so the auth server sends an OTP to the user’s phone. The user enters the code in the app to complete verification.

- **SMS OTP** – Auth server sends a one-time code via SMS  
- **CIBA** – Same OpenID Connect CIBA grant as other flows, with `channel: 'sms'`  
- **Callback** – Backend submits the user-entered code to the auth server callback before token exchange  
- **Scope** – Typically `openid ip:phone_verify` for phone verification

**Use for**: Phone number verification (PVN), login with SMS OTP, KYC.

---

## Quick Setup

### 1. Configure Auth Servers

In `config/default.json`:

```json
{
  "auth_servers": [
    {
      "id": "stage",
      "url": "https://api.stage.ipification.com/auth"
    }
  ]
}
```

### 2. Configure Client

Add an SMS client:

```json
{
  "clients": [
    {
      "user_flow": "pvn_sms",
      "title": "SMS Phone Number Verification",
      "scope": "openid ip:phone_verify"
    }
  ]
}
```

### 3. UI

The app shows an SMS button when `pvn_sms` is in the PNV flows. User enters phone number, starts the flow, receives SMS, then enters OTP in the popup.

---

## How to Use

### User flow

1. User selects auth server (if multiple).
2. User enters phone number and clicks the **SMS** button.
3. Backend starts CIBA with `channel: 'sms'`; auth server sends OTP via SMS.
4. User receives SMS with OTP (e.g. “Your verification PIN is: 123456”).
5. App shows “Enter OTP code” popup; user types the code and confirms.
6. Backend sends the code to the auth server callback, then exchanges for tokens and loads user info.
7. User is redirected to `/user/info`.

### Developer flow

```text
1. POST /sms/auth     → start CIBA (channel sms), get auth_req_id + nonce
2. User gets SMS and enters OTP
3. POST /sms/token    → send code to auth callback, then token + userinfo
4. Optional: POST /sms/log → log flow data
```

---

## Configuration

### Required config

- **auth_servers**: At least one server (see [CONFIG_DEFAULT_JSON_SAMPLE.md](CONFIG_DEFAULT_JSON_SAMPLE.md)).
- **client_id** and **client_secret**: OAuth client used for CIBA.
- **realm**: Usually `"ipification"`.
- **clients**: One entry with `user_flow: "pvn_sms"` (and optional `title`, `scope`).

### Client scope

SMS verification typically uses:

- `openid ip:phone_verify`

The message template (e.g. “Your verification PIN is: {{code}}”) is set in the backend when calling CIBA auth (see [Technical Details](#technical-details)).

---

## Frontend Integration

### Login button (Pug)

The SMS button is rendered when `pvn_sms` is in the PNV flows and a client has `user_flow: "pvn_sms"`:

```pug
button#pvn_sms.btn_sms(data-user-flow='pvn_sms' data-client-id=client.client_id) SMS
```

### JavaScript (login.js)

- **start_pvn_sms(client_id, phone_number)**  
  Builds payload with `login_hint` (phone), `client_id`, `scope`, `server_id` and calls `start_sms_flow(data)`.

- **start_sms_flow(data)**  
  1. `POST /sms/auth` with `data` → get `auth_req_id`, `nonce`.  
  2. Show SweetAlert2 “Enter OTP code” dialog.  
  3. On confirm, `POST /sms/token` with `code`, `auth_req_id`, `client_id`, `nonce`, `server_id`.  
  4. On success, redirect to `/user/info`. Optionally call `log_sms_data()`.

- **log_sms_data(data)**  
  `POST /sms/log` with `{ data }` for logging.

Phone number is validated (e.g. intl-tel-input) before starting the flow.

---

## Technical Details

### Architecture overview

The app only talks to the showcase backend. The backend talks to the IPification auth server.

1. **Client → Backend**: `POST /sms/auth` (phone as `login_hint`, client_id, scope, server_id).
2. **Backend → Auth server**: CIBA auth with `channel: 'sms'` and message template.
3. **Auth server**: Sends SMS with OTP to the phone.
4. **Backend → Client**: Returns `auth_req_id`, `nonce`, and `auth_server` info.
5. **User**: Enters OTP in the popup.
6. **Client → Backend**: `POST /sms/token` with OTP `code`, `auth_req_id`, `client_id`, `nonce`, `server_id`.
7. **Backend → Auth server**: `POST .../ext/bc/sms/callback` with `{ code }`, `Authorization: Bearer {auth_req_id}`.
8. **Backend → Auth server**: `POST .../token` with CIBA grant → get `access_token`.
9. **Backend → Auth server**: `GET .../userinfo` with `access_token`.
10. **Backend → Client**: User info JSON; backend sets session and returns response.

### CIBA auth request (backend)

Backend calls the auth server CIBA auth endpoint with form body including:

- `client_id`, `client_secret`
- `scope` (e.g. `openid ip:phone_verify`)
- `login_hint`: user phone number
- `channel`: `'sms'`
- `message`: template, e.g. `'Your verification PIN is: {{code}}'`

Response contains `auth_req_id`, which is used in the callback and token exchange.

### Callback (backend)

Before token exchange, the backend must submit the user-entered OTP to the auth server so it can complete the CIBA consent:

- **URL**: `{authServerUrl}/realms/{realm}/protocol/openid-connect/ext/bc/sms/callback`
- **Method**: POST
- **Headers**: `Authorization: Bearer {auth_req_id}`, `Content-Type: application/json`
- **Body**: `{ "code": "<otp>" }`

After a successful callback, the backend uses the same `auth_req_id` in the token endpoint.

### Token exchange (backend)

Same as other CIBA flows:

- **URL**: `{authServerUrl}/realms/{realm}/protocol/openid-connect/token`
- **Method**: POST
- **Body**: `client_id`, `client_secret`, `grant_type: 'urn:openid:params:grant-type:ciba'`, `auth_req_id`

Then userinfo is fetched with the returned `access_token`.

---

## API Endpoints

### 1. Start SMS auth

**POST** `/sms/auth`

Starts the CIBA flow with SMS channel. Auth server sends OTP to the given phone.

#### Request

- **Headers**: `Content-Type: application/json`
- **Body**:

```json
{
  "client_id": "your_client_id",
  "server_id": "stage",
  "login_hint": "+1234567890",
  "scope": "openid ip:phone_verify"
}
```

| Field        | Type   | Required | Description                                      |
| ------------ | ------ | -------- | ------------------------------------------------ |
| `client_id`  | string | Yes      | OAuth2 client ID                                 |
| `server_id`  | string | No       | Auth server ID; defaults to first server         |
| `login_hint` | string | Yes      | User phone number (E.164)                        |
| `scope`      | string | No       | Scopes; defaults to client’s configured scope    |

#### Response (200 OK)

```json
{
  "auth_server": { "id": "stage", "url": "https://api.stage.ipification.com/auth" },
  "auth_req_id": "<auth_req_id>",
  "nonce": "<uuid>"
}
```

| Field         | Type   | Description              |
| -------------- | ------ | ------------------------ |
| `auth_server`  | object | Selected auth server     |
| `auth_req_id`  | string | CIBA auth request ID     |
| `nonce`        | string | Session/correlation id   |

#### Error responses

- **400**: Invalid or missing `server_id`, or no auth servers configured.
- **401**: Client not found (invalid `client_id`).
- **5xx**: Auth server error; body may include `error`, `status`, `data` (upstream response).

---

### 2. Exchange OTP for token and user info

**POST** `/sms/token`

Sends the user-entered OTP to the auth server callback, then performs CIBA token exchange and returns user info.

#### Request

- **Headers**: `Content-Type: application/json`
- **Body**:

```json
{
  "code": "123456",
  "auth_req_id": "<auth_req_id_from_sms_auth>",
  "client_id": "your_client_id",
  "nonce": "<nonce_from_sms_auth>",
  "server_id": "stage"
}
```

| Field         | Type   | Required | Description                        |
| ------------- | ------ | -------- | ---------------------------------- |
| `code`        | string | Yes      | OTP from SMS                       |
| `auth_req_id` | string | Yes      | From `/sms/auth` response          |
| `client_id`   | string | Yes      | OAuth2 client ID                   |
| `nonce`       | string | Yes      | From `/sms/auth` response          |
| `server_id`   | string | No       | Auth server ID                     |

#### Response (200 OK)

```json
{
  "auth_server": { "id": "stage", "url": "..." },
  "sub": "<subject>",
  "phone_number": "+1234567890",
  "phone_number_verified": true
}
```

User info fields depend on scope and auth server. Session is set for `/user/info`.

#### Error responses

- **400**: Invalid or missing `server_id`, or no auth servers configured.
- **401**: Client not found.
- **4xx/5xx**: Callback or token/userinfo error; body includes `error`, `status`, and optionally `data`. Session may still be updated with error payload for display.

---

### 3. Log SMS flow data

**POST** `/sms/log`

Optional endpoint to log client-side flow data (e.g. token response) for debugging or analytics.

#### Request

- **Headers**: `Content-Type: application/json`
- **Body**: `{ "data": { ... } }`

#### Response

- **200**: Body `"OK"`. Logging is implementation-specific (e.g. server logs).

---

## Troubleshooting

### "Invalid server_id" or "No auth servers configured"

- Ensure `auth_servers` in config has at least one entry and that `server_id` (if sent) matches one of the `id` values.

### "Client not found" (401)

- Check that `client_id` matches a configured client and that credentials (e.g. `client_secret`) are correct for that client.

### No SMS received

- Confirm auth server is configured to send SMS and that the number is in E.164 format.
- Check auth server logs and SMS provider/configuration (rate limits, number format, country).

### OTP rejected or "Unable to verify OTP code"

- User must enter the exact code from the SMS before it expires.
- Ensure the backend calls the SMS callback with the same `auth_req_id` before calling the token endpoint.
- Check auth server callback and token endpoints for detailed error in response `data`.

### Session / user info not updated

- On token error, the backend may still set session with error payload; check response body and session handling in `routes/sms.js` and `/user/info`.

---

## Related Documentation

- [TS43 SIM Verification](TS43.md) – SIM-based verification (no SMS).
- [API Reference](API.md) – Other endpoints.
- [Architecture](ARCHITECTURE.md) – System overview.
- [Configuration](CONFIG_DEFAULT_JSON_SAMPLE.md) – Auth servers and clients.
