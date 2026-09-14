# API Documentation

Quick reference for API endpoints and usage patterns.

## Table of Contents

- [Quick Start](#quick-start)
- [Common Use Cases](#common-use-cases)
- [Essential Endpoints](#essential-endpoints)
  - [Start Authentication](#start-authentication)
  - [Handle Callback](#handle-callback)
  - [Get User Info](#get-user-info)
- [Mobile Integration](#mobile-integration)
- [TS43/SIM Integration](#ts43sim-integration)
- [Configuration API](#configuration-api)
- [Play Integrity Backend Demo](#play-integrity-backend-demo)
- [Error Handling](#error-handling)
- [Advanced Details](#advanced-details)

---

## Quick Start

**Base URL**: `http://localhost:3000` (development)

**Most Common Flow**:

1. User clicks button → Redirects to `/auth/start`
2. User authenticates → IPification redirects to `/auth/callback`
3. App redirects to `/user/info` → Shows user data

**Authentication**: Session-based (handled automatically)

---

## Common Use Cases

### I want to add authentication to my web app

→ Use `/auth/start` → user authenticates → handle `/auth/callback`

### I want to integrate with mobile app

→ Use `/auth/mobile/login` with authorization code

### I want to use SIM-based verification

→ Use `/ts43/auth` → `/ts43/token` flow (see [TS43 Guide](TS43.md))

### I want to use SMS OTP verification

→ Use `/sms/auth` → user enters OTP → `/sms/token` flow (see [SMS Flow Guide](SMS.md))

### I want to get app configuration

→ Call `/api/config` to get auth_servers, clients, etc.

### I want to protect an Android backend request with Play Integrity

→ Enable `PLAY_INTEGRITY_ENABLED=true`, then call
`POST /api/play-integrity/verify`. See [Play Integrity backend demo](PLAY_INTEGRITY.md)
for Google Cloud setup and Android token lifecycle.

---

## Essential Endpoints

### Start Authentication

**GET** `/auth/start?user_flow=pvn_ip&server_id=stage&state=abc123`

Starts OAuth flow and redirects user to IPification.

**Required**:

- `user_flow`: Which flow to use (`pvn_ip`, `login_ip`, etc.)
- `state`: Random string for security

**Optional**:

- `server_id`: Which auth server (`stage`, `live`). Defaults to first server
- `phone`: Pre-fill phone number

---

### Handle Callback

**GET** `/auth/callback/:userFlow/:serverId?`

IPification redirects here after authentication. Your app handles this automatically.

**Example**: `/auth/callback/pvn_ip/stage?code=xyz&state=abc`

---

### Get User Info

**GET** `/user/info`

Shows authenticated user information (requires valid session).

---

## Mobile Integration

### POST /auth/mobile/login

Exchange authorization code for user info (for mobile apps).

**Request**:

```json
{
  "client_id": "your_client_id",
  "code": "auth_code",
  "redirect_uri": "your_callback_url",
  "server_id": "stage"
}
```

**Response**: User information JSON

---

## TS43/SIM Integration

For SIM-based verification, see dedicated [TS43 Guide](TS43.md).

**Quick overview**:

1. POST `/ts43/auth` → get digital_request
2. Call Credential Manager
3. POST `/ts43/token` → get user info

---

## Configuration API

### GET /api/config

Get application configuration (auth servers, clients, etc.)

**Response**:

```json
{
  "auth_servers": [
    {"id": "stage", "url": "https://..."}
  ],
  "realm": "ipification",
  "clients": [...]
}
```

---

## Play Integrity Backend Demo

The IPification demo flow is enabled only when `PLAY_INTEGRITY_ENABLED=true`.
Create an attempt, verify its fresh Play Integrity token, then exchange the
IPification authorization code:

```text
POST /api/play-integrity/attempt
  -> attempt_id, backend-returned request_hash, expires_at
POST /api/play-integrity/verify
  -> signed state, expires_at
setState(state), then start IPification
POST /api/play-integrity/token-exchange
  -> decision: allow
```

### POST /api/play-integrity/attempt

Creates an immutable authentication attempt. `phone_number` and `server_id` are
required; `server_id` is mandatory even when a default auth server exists. The
backend resolves and snapshots the configured `PLAY_INTEGRITY_USER_FLOW` client
and server, normalizes and hashes the phone number, and returns the hash Android
must use verbatim.

**Request**:

```json
{
  "phone_number": "<e164-phone-number>",
  "server_id": "<configured-server-id>"
}
```

**Response — HTTP 201**:

```json
{
  "attempt_id": "<attempt-id>",
  "request_hash": "<backend-returned-request-hash>",
  "expires_at": "<iso-8601-expiry>"
}
```

The attempt and its transaction expire after 120 seconds. The response never
contains the stored client secret or normalized phone number.

### POST /api/play-integrity/verify

Verifies an Android Play Integrity Standard API token and checks that it was
created for the same immutable attempt received by the backend.

**Request**:

```json
{
  "attempt_id": "<attempt-id>",
  "integrity_token": "<fresh-token-from-android>"
}
```

Android must request a fresh token for each attempt and send it only once. The
backend obtains the expected request hash from the stored attempt; the verify
request does not accept an action, phone number, or client/server configuration.

Android and the backend must use this exact request hash:

```text
base64url(SHA-256(UTF-8(action + "\n" + canonicalJson(payload))))
```

`canonicalJson` recursively sorts object keys and preserves array order. The
server computes the hash from the immutable attempt snapshot, including the
normalized phone-number hash, attempt ID, client ID, and server ID. Android
supplies that exact string to the Standard Integrity API.

**Successful response — HTTP 201**:

```json
{
  "state": "<signed-state>",
  "expires_at": "<iso-8601-expiry>"
}
```

| Status | `decision` | Meaning |
| --- | --- | --- |
| 201 | state returned | Hash and configured integrity policy passed. |
| 400 | `deny` | Malformed request; Google is not called. |
| 403 | `deny` | Token decoded but did not meet policy. |
| 409 | `deny` | Attempt is expired or already used. |
| 503 | `unavailable` | Google credentials, network, decode, or timeout failure. The attempt is rejected. |

Policy reason codes include `REQUEST_HASH_MISMATCH`, `APP_NOT_RECOGNIZED`,
`DEVICE_INTEGRITY_NOT_MET`, and (when strict licensing is enabled)
`APP_NOT_LICENSED`. Dependency reason codes are `GOOGLE_CREDENTIALS_UNAVAILABLE`,
`GOOGLE_DECODE_FAILED`, and `GOOGLE_DECODE_TIMEOUT`.

The API never returns the submitted Integrity token, service-account
credential, Google access token, or raw decoded Google response.

### POST /api/play-integrity/token-exchange

After verification, Android must call `setState(state)` before starting
IPification. Send the returned authorization code and unchanged signed state:

```json
{
  "code": "<authorization-code>",
  "state": "<signed-state>"
}
```

Successful response — HTTP 200:

```json
{ "decision": "allow" }
```

The backend verifies and atomically consumes the transaction before exchanging
the code with IPification. A state, attempt, or authorization code cannot be
reused. A failed upstream exchange returns HTTP 401 with
`IPIFICATION_EXCHANGE_FAILED`.

### Security and operational limits

- Attempts, transactions, and signed states have a 120-second TTL.
- The built-in `dataStore` is an in-memory, single-process store; it is not
  shared between workers or instances and is lost on restart.
- Production must use Redis or a database with atomic claim/consume operations,
  and bind the attempt and signed state to an authenticated user session or a
  short-lived verification session.
- Never log phone numbers or other PII, request bodies, integrity tokens,
  authorization codes, signed states, credentials, client secrets, or decoded
  Google payloads. Logs may contain only request ID, endpoint, decision, reason
  codes, and duration.

**Server setup**:

1. Link the app's Play Console configuration to its Google Cloud project and enable Play Integrity API.
2. Give the backend runtime identity permission to decode verdicts for that project.
3. Set `PLAY_INTEGRITY_PACKAGE_NAME` to the Android `applicationId`.
4. Provide Application Default Credentials using workload identity or a read-only secret mount; never commit a key file.
5. Set `PLAY_INTEGRITY_USER_FLOW` to the configured flow to use (for this demo,
   `pvn_ip`), set `PLAY_INTEGRITY_ENABLED=true`, and restart the server.

For local demo troubleshooting only, `PLAY_INTEGRITY_BYPASS_VERIFICATION=true`
skips the Google verdict call after the endpoint has claimed a valid attempt and
received an integrity token. It is ignored when `NODE_ENV=production`.

The full Android provider warm-up, credential guidance, and manual test
checklist are in [PLAY_INTEGRITY.md](PLAY_INTEGRITY.md).

---

## Error Handling

**Common Errors**:

| Error                            | Cause                | Solution                        |
| -------------------------------- | -------------------- | ------------------------------- |
| `Invalid server_id`              | Server not in config | Check auth_servers in config    |
| `Client not found`               | Invalid user_flow    | Check clients array in config   |
| `server_id not found in session` | Session expired      | User needs to restart auth flow |

---

## Advanced Details

<details>
<summary>Click to expand detailed endpoint specifications</summary>

#### Detailed Authentication Endpoints

#### Login Page

**GET** `/auth/login`

Display the login page with available authentication options.

**Response**: HTML page (Pug template)

**Query Parameters**: None

---

#### Start Authentication Flow

**GET** `/auth/start`

Initiates the OAuth2/OIDC authentication flow by redirecting to IPification authorization server.

**Query Parameters**:

| Parameter   | Type   | Required | Description                                                      |
| ----------- | ------ | -------- | ---------------------------------------------------------------- |
| `user_flow` | string | Yes      | User flow identifier (e.g., `pvn_ip`, `login_ip`)                |
| `server_id` | string | No       | Auth server ID (e.g., `stage`, `live`). Defaults to first server |
| `phone`     | string | No       | Phone number in E.164 format (e.g., `+1234567890`)               |
| `state`     | string | Yes      | State parameter for OAuth flow (used for CSRF protection)        |

**Example Request**:

```
GET /auth/start?user_flow=pvn_ip&server_id=stage&phone=+1234567890&state=abc123xyz
```

**Response**: HTTP 302 Redirect to IPification authorization server

**Flow**:

1. Validates `server_id` and resolves to auth server URL (defaults to first server if not provided)
2. Validates user flow exists in configuration
3. Validates state parameter
4. Builds authorization URL with OAuth2 parameters
5. Redirects user to IPification authorization server

**Callback URL Format**:
The redirect_uri sent to auth server will be: `/auth/callback/{user_flow}/{server_id}`

**Error Responses**:

| Status Code | Error Message                | Cause                         |
| ----------- | ---------------------------- | ----------------------------- |
| 400         | `Invalid server_id: 'xyz'`   | Server ID not found in config |
| 400         | `No auth servers configured` | auth_servers array is empty   |

---

#### OAuth Callback

**GET** `/auth/callback/:userFlow/:serverId?`

Handles the OAuth2 callback after user authentication.

**Path Parameters**:

| Parameter  | Type   | Required | Description                                                      |
| ---------- | ------ | -------- | ---------------------------------------------------------------- |
| `userFlow` | string | Yes      | User flow identifier (e.g., `pvn_ip`, `login_ip`)                |
| `server_id` | string | No       | Auth server ID (e.g., `stage`, `live`). Defaults to first server |

**Query Parameters**:

| Parameter           | Type   | Required | Description                           |
| ------------------- | ------ | -------- | ------------------------------------- |
| `code`              | string | Yes      | Authorization code from IPification   |
| `state`             | string | Yes      | State parameter (must match original) |
| `error`             | string | No       | Error code if authentication failed   |
| `error_description` | string | No       | Error description                     |

**Example Requests**:

```
GET /auth/callback/pvn_ip/stage?code=abc123&state=xyz789
```

```
GET /auth/callback/login_ip?code=abc123&state=xyz789
(Uses default/first server when serverId not in URL)
```

**Response**:

- Success: HTTP 302 Redirect to `/auth/complete?state=xyz789`
- QR Code Flow: HTTP 302 Redirect to `/auth/qrcode/complete` or `/auth/qrcode/error`
- Backchannel Flow: HTTP 200 (empty body)
- Error: HTTP 302 Redirect to `/auth/login` with error message

**Flow**:

1. Extracts `server_id` from URL path (or defaults to first server)
2. Resolves auth server URL from `server_id`
3. Validates authorization code and state
4. Exchanges authorization code for access token (using same auth server)
5. Retrieves user information using access token
6. Stores user information in data store
7. For QR code flows, emits Socket.io event to desktop browser
8. Redirects to completion endpoint

**Headers**:

- `ip-backchannel-im-auth`: Set to `true` for server-to-server IM flows

**Error Responses**:

| Status Code | Error Message                | Cause                         |
| ----------- | ---------------------------- | ----------------------------- |
| 400         | `Invalid server_id: 'xyz'`   | Server ID not found in config |
| 400         | `No auth servers configured` | auth_servers array is empty   |

---

#### Complete Authentication

**GET** `/auth/complete`

Completes the authentication flow and retrieves stored user information.

**Query Parameters**:

| Parameter | Type   | Required | Description     |
| --------- | ------ | -------- | --------------- |
| `state`   | string | Yes      | State parameter |

**Example Request**:

```
GET /auth/complete?state=xyz789
```

**Response**: HTTP 302 Redirect to `/user/info`

**Flow**:

1. Retrieves user information from data store using state
2. Polls data store (up to 5 attempts with 1-second delay)
3. Sets session variables (`isAuthenticated`, `userData`)
4. Redirects to user info page

---

#### QR Code Success Page

**GET** `/auth/qrcode/complete`

Displays success page after QR code authentication.

**Response**: HTML page (Pug template)

---

#### QR Code Error Page

**GET** `/auth/qrcode/error`

Displays error page if QR code authentication failed.

**Response**: HTML page (Pug template)

---

#### Mobile Login

**POST** `/auth/mobile/login`

Mobile-specific endpoint for exchanging authorization code for user information.

**Request Headers**:

```
Content-Type: application/json
```

**Request Body**:

| Field          | Type   | Required | Description                                                      |
| -------------- | ------ | -------- | ---------------------------------------------------------------- |
| `client_id`    | string | Yes      | OAuth client ID                                                  |
| `code`         | string | Yes      | Authorization code                                               |
| `redirect_uri` | string | Yes      | Callback URL (must match OAuth redirect)                         |
| `server_id`    | string | No       | Auth server ID (e.g., `stage`, `live`). Defaults to first server |

**Example Request**:

```json
{
  "client_id": "webclient2",
  "code": "authorization-code",
  "redirect_uri": "https://example.com/auth/callback/pvn_ip/stage",
  "server_id": "stage"
}
```

**Response**:

```json
{
  "sub": "user-id",
  "phone_number": "+1234567890",
  "phone_number_verified": "true"
}
```

**Status Codes**:

- `200`: Success - Returns user information
- `400`: Invalid server_id or missing required fields
- `401`: Client not found or authentication failed

---

#### Server-to-Server Sign-In

**POST** `/auth/s2s/signin`

Server-to-server sign-in endpoint for retrieving user information.

**Request Body**:

```json
{
  "state": "state-parameter"
}
```

**Response**:

```json
{
  "sub": "user-id",
  "phone_number": "+1234567890",
  ...
}
```

**Status Codes**:

- `200`: Success
- `401`: User information not found

---

### TS43 Protocol Endpoints

#### TS43 Authentication

**POST** `/ts43/auth`

Initiates TS43 (SIM-based) authentication flow using CIBA (Client Initiated Backchannel Authentication).

**Request Body**:

```json
{
  "login_hint": "+1234567890",
  "carrier_hint": "carrier-code",
  "client_id": "webclient3",
  "operation": "VerifyPhoneNumber",
  "scope": "openid"
}
```

**Parameters**:

| Parameter      | Type   | Required | Description                                              |
| -------------- | ------ | -------- | -------------------------------------------------------- |
| `login_hint`   | string | No       | Phone number hint                                        |
| `carrier_hint` | string | No       | Carrier code hint                                        |
| `client_id`    | string | Yes      | Client identifier                                        |
| `operation`    | string | No       | Operation type (`VerifyPhoneNumber` or `GetPhoneNumber`) |
| `scope`        | string | No       | OAuth2 scope (defaults to client scope)                  |

**Response**:

```json
{
  "auth_req_id": "auth-request-id",
  "nonce": "nonce-value",
  "digital_request": {
    "protocol": "openid4vp-v1-unsigned",
    "data": {
      "response_type": "vp_token",
      "response_mode": "dc_api",
      "nonce": "nonce-value",
      "dcql_query": {
        "credentials": [...]
      }
    }
  }
}
```

**Status Codes**:

- `200`: Success
- `401`: Client not found
- `500`: Server error

**Flow**:

1. Validates client configuration
2. Calls CIBA auth endpoint to get `auth_req_id`
3. Calls DCQL endpoint to get credential query
4. Returns digital request structure for mobile app

---

#### TS43 Token Exchange

**POST** `/ts43/token`

Exchanges VP token for access token in TS43 flow.

**Request Body**:

```json
{
  "vp_token": "vp-token-value",
  "auth_req_id": "auth-request-id",
  "client_id": "webclient3",
  "nonce": "nonce-value"
}
```

**Response**:

```json
{
  "sub": "user-id",
  "phone_number": "+1234567890",
  ...
}
```

**Status Codes**:

- `200`: Success
- `401`: Client not found
- `500`: Server error

**Flow**:

1. Validates client configuration
2. Calls callback endpoint with VP token
3. Exchanges auth_req_id for access token using CIBA grant type
4. Retrieves user information
5. Sets session and returns user info

---

#### TS43 Log

**POST** `/ts43/log`

Logging endpoint for TS43 debugging.

**Request Body**:

```json
{
  "data": {...}
}
```

**Response**: `"OK"`

---

### SMS Flow Endpoints

See [SMS Flow Guide](SMS.md) for full documentation.

#### POST /sms/auth

Starts CIBA with SMS channel. Auth server sends OTP to the given phone.

**Request Body**: `client_id`, `server_id` (optional), `login_hint` (phone), `scope` (optional)

**Response**: `auth_server`, `auth_req_id`, `nonce`

#### POST /sms/token

Submits user-entered OTP to auth server callback, then exchanges for token and user info.

**Request Body**: `code` (OTP), `auth_req_id`, `client_id`, `nonce`, `server_id` (optional)

**Response**: User info (e.g. `sub`, `phone_number`, `phone_number_verified`) and `auth_server`

#### POST /sms/log

Optional logging for SMS flow debugging. **Request Body**: `{ "data": {...} }`. **Response**: `"OK"`

---

### Utility Endpoints

#### App Config

**GET** `/api/config`

Returns safe application configuration for the frontend (client secrets are removed).

**Response**:

```json
{
  "realm": "ipification",
  "auth_servers": [
    {
      "id": "stage",
      "url": "https://api.stage.ipification.com/auth"
    }
  ],
  "clients": [
    {
      "user_flow": "pvn_ip",
      "client_id": "your-client-id",
      "title": "IP Phone Number Verification",
      "scope": "openid ip:phone_verify"
    }
  ]
}
```

**Flow**:

1. Reads config from `res.locals`
2. Strips `client_secret` from each client entry
3. Returns `auth_servers`, `realm`, and safe `clients`

---

#### GeoIP Lookup

**GET** `/api/geoip`

Returns country code based on client IP address.

**Response**:

```json
{
  "country": "us",
  "ip": "192.168.1.1"
}
```

**Flow**:

1. Extracts client IP from request
2. Performs GeoIP lookup
3. Returns country code (lowercase) and IP address

---

#### User Information

**GET** `/user/info`

Displays authenticated user information (requires valid session).

**Response**: HTML page (Pug template)

**Session Requirements**:

- `isAuthenticated`: Must be `true`
- `userData`: User data object

**Status Codes**:

- `200`: Success (renders info page)
- `302`: Redirects to `/` if not authenticated

---

---

## WebSocket Events (Socket.io)

### Client Events

#### Initialize Connection

**Event**: `init`

**Payload**:

```json
{
  "state": "state-parameter"
}
```

**Description**: Joins client to a room channel for receiving authentication updates.

**Channel Format**: `auth:{state}`

---

### Server Events

#### Connection Confirmed

**Event**: `messages`

**Payload**:

```json
{
  "event_name": "connected",
  "socket_id": "socket-id"
}
```

**Description**: Sent immediately after client connects.

---

#### Authentication URL

**Event**: `messages`

**Payload**:

```json
{
  "event_name": "url",
  "url": "http://example.com/auth/complete?state=xyz789"
}
```

**Description**: Sent when QR code authentication completes. Desktop browser should navigate to the provided URL.

---

---

## Error Handling

### Error Responses

All endpoints follow standard HTTP status codes:

- `200`: Success
- `302`: Redirect
- `400`: Bad Request (invalid parameters)
- `401`: Unauthorized (authentication failed)
- `404`: Not Found
- `500`: Internal Server Error

### Error Format

For JSON responses:

```json
{
  "error": "Error message",
  "status": 400
}
```

For HTML responses, errors are displayed in modals or redirect to login page with error message in session.

---

## Rate Limiting

Currently, no rate limiting is implemented. Consider implementing rate limiting for production deployments.

---

## Security Considerations

1. **State Parameter**: Always validate state parameter to prevent CSRF attacks
2. **Secret Keys**: Keep notification secret keys secure
3. **HTTPS**: Use HTTPS in production
4. **Session Security**: Configure secure session cookies
5. **Input Validation**: Validate all input parameters

---

## Examples

### Complete Authentication Flow

```bash
# 1. Start authentication
curl "http://localhost:3000/auth/start?user_flow=pvn_ip&state=abc123"

# 2. After user completes authentication, callback is called automatically
# 3. Complete authentication
curl "http://localhost:3000/auth/complete?state=abc123"

# 4. View user info (requires session cookie)
curl -b cookies.txt "http://localhost:3000/user/info"
```

### Mobile Login Flow

```bash
# Exchange authorization code for user info
curl -X POST http://localhost:3000/auth/mobile/login \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "webclient2",
    "code": "authorization-code",
    "redirect_uri": "https://example.com/callback"
  }'
```

### TS43 Flow

```bash
# 1. Initiate TS43 authentication
curl -X POST http://localhost:3000/ts43/auth \
  -H "Content-Type: application/json" \
  -d '{
    "login_hint": "+1234567890",
    "client_id": "webclient3",
    "operation": "VerifyPhoneNumber"
  }'

# 2. Exchange VP token (after mobile app completes)
curl -X POST http://localhost:3000/ts43/token \
  -H "Content-Type: application/json" \
  -d '{
    "vp_token": "vp-token",
    "auth_req_id": "auth-req-id",
    "client_id": "webclient3",
    "nonce": "nonce-value"
  }'
```

</details>
