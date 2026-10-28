# Architecture Overview

> A separate Next.js application is being migrated in `showcase-next/`. See the [migration guide](NEXTJS_MIGRATION.md) for its runtime configuration, commands, compatibility limits and verification. The existing Express application remains available.


Understanding how the IPification Showcase works at a high level.

## Table of Contents

- [What is this app?](#what-is-this-app)
- [How it works](#how-it-works)
- [Key Components](#key-components)
- [Authentication Flows](#authentication-flows)
- [Configuration](#configuration)
- [Security](#security)
- [Extending the App](#extending-the-app)
- [Technical Details](#technical-details)

---

## What is this app?

A **showcase/demo application** for IPification authentication services. It demonstrates:

- ✅ Multiple authentication methods (IP, IM, SIM)
- ✅ Phone number verification flows
- ✅ QR code authentication for desktop
- ✅ Multi-server support (stage, live, etc.)

**Tech stack**: Node.js + Express + Pug templates

---

## How it works

```
┌─────────────┐         ┌──────────────┐         ┌─────────────────┐
│   Browser   │────────│  This App    │────────│ IPification API │
│             │         │  (Express)   │         │  (OAuth Server) │
└─────────────┘         └──────────────┘         └─────────────────┘

Flow:
1. User clicks button
2. App redirects to IPification
3. User authenticates
4. IPification redirects back
5. App shows user info
```

---

## Key Components

### Frontend

- **Pug Templates**: Login page, user info page
- **JavaScript**: Button handlers, QR code, phone input
- **CSS**: Styling and animations

### Backend

- **Express Routes**: Handle auth flow
- **Session Management**: Track user state
- **OAuth2 Client**: Talk to IPification
- **WebSocket**: For QR code flow (desktop ↔ mobile)

### Configuration

- **auth_servers**: Which IPification servers to use
- **clients**: Which auth flows to enable
- **locale**: UI text customization

---

## Authentication Flows

### Standard Flow (Mobile/Desktop Web)

For the IP phone-verification walkthrough, request examples, and source map, see [PNV via IP](PNV.md).

```
User clicks button
  ↓
/auth/start (redirects to IPification)
  ↓
User authenticates on IPification
  ↓
/auth/callback (receives code)
  ↓
Exchange code for user info
  ↓
Show user info page
```

### QR Code Flow (Desktop + Mobile)

```
Desktop: Generate QR code with auth URL
Mobile: Scan QR → authenticate
Desktop: Receives notification via WebSocket → shows result
```

### SIM Flow (TS43)

```
User clicks SIM button
  ↓
Browser requests SIM credential
  ↓
User confirms on device
  ↓
Show verified phone number
```

---

## Configuration

Three main config files:

1. **config/default.json** - Your setup (auth servers, clients, credentials)
2. **config/locale.json** - UI text labels
3. **config/app_config.json** - App behavior settings

See [CONFIG_DEFAULT_JSON_SAMPLE.md](CONFIG_DEFAULT_JSON_SAMPLE.md) for details.

---

## Security

- ✅ OAuth2 authorization code flow
- State parameter for callback/result correlation; the standard web flow does not compare it against a saved session value (see [PNV limitations](PNV.md#verification-results-and-current-limitations))
- ✅ Session management
- ✅ HTTPS recommended for production
- ✅ Helmet.js security headers

---

## Extending the App

### Add new authentication flow

1. Add client config in `config/default.json`
2. Add button in `views/login.pug`
3. Done! Routes handle it automatically

### Add new auth server

1. Add to `auth_servers` array in config
2. Restart app
3. Dropdown appears automatically

### Customize UI text

1. Edit `config/locale.json`
2. Or override in `config/default.json`
3. Restart app

---

## Technical Details

<details>
<summary>📚 Click for detailed architecture diagrams and module structure</summary>

### System Architecture

### Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Express Application                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Routes     │  │  Middleware  │  │   Views      │      │
│  │              │  │              │  │   (Pug)       │      │
│  │ - auth.js    │  │ - Session    │  │ - login.pug  │      │
│  │ - user.js    │  │ - Helmet    │  │ - info.pug   │      │
│  │ - ts43.js    │  │ - Logger    │  │ - qr_*.pug   │      │
│  │              │  │ - Parser    │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Services   │  │   Libraries  │  │   Socket.io   │      │
│  │              │  │              │  │              │      │
│  │ - DataStore  │  │ - Axios      │  │ - Real-time  │      │
│  │              │  │ - GeoIP      │  │   Events     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Application Flow

### Standard Authentication Flow

```
┌─────────┐      ┌──────────┐      ┌──────────────┐      ┌──────────┐
│ Browser │      │ Express  │      │ IPification │      │ Browser │
└────┬────┘      └────┬─────┘      └──────┬───────┘      └────┬─────┘
     │                │                   │                   │
     │ GET /auth/start│                   │                   │
     ├───────────────>│                   │                   │
     │                │ Build Auth URL    │                   │
     │                │──────────────────>│                   │
     │                │                   │                   │
     │ 302 Redirect   │                   │                   │
     │<───────────────┤                   │                   │
     │                │                   │                   │
     │                │                   │ User Auth        │
     │                │                   │<─────────────────┤
     │                │                   │                   │
     │                │ Callback          │                   │
     │                │<──────────────────┤                   │
     │                │                   │                   │
     │                │ Exchange Code     │                   │
     │                │──────────────────>│                   │
     │                │                   │                   │
     │                │ Access Token      │                   │
     │                │<──────────────────┤                   │
     │                │                   │                   │
     │                │ Get User Info     │                   │
     │                │──────────────────>│                   │
     │                │                   │                   │
     │                │ User Info         │                   │
     │                │<──────────────────┤                   │
     │                │                   │                   │
     │ 302 Redirect   │                   │                   │
     │<───────────────┤                   │                   │
     │                │                   │                   │
     │ GET /auth/complete                 │                   │
     ├───────────────>│                   │                   │
     │                │                   │                   │
     │ 302 Redirect   │                   │                   │
     │<───────────────┤                   │                   │
     │                │                   │                   │
     │ GET /user/info │                   │                   │
     ├───────────────>│                   │                   │
     │                │                   │                   │
     │ HTML Response │                   │                   │
     │<───────────────┤                   │                   │
```

### QR Code Flow (Desktop)

```
┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│ Desktop  │      │ Express  │      │  Mobile  │      │Express   │
│ Browser  │      │  Server  │      │  Device  │      │ Socket   │
└────┬─────┘      └────┬─────┘      └────┬─────┘      └────┬─────┘
     │                 │                 │                 │
     │ GET /auth/start │                 │                 │
     ├───────────────>│                 │                 │
     │                 │                 │                 │
     │ QR Code Display │                 │                 │
     │<───────────────┤                 │                 │
     │                 │                 │                 │
     │ Socket: init    │                 │                 │
     ├───────────────>│                 │                 │
     │                 │ Join Room       │                 │
     │                 │────────────────>│                 │
     │                 │                 │                 │
     │                 │                 │ Scan QR & Auth  │
     │                 │                 │────────────────>│
     │                 │                 │                 │
     │                 │ Callback        │                 │
     │                 │<─────────────────────────────────┤
     │                 │                 │                 │
     │                 │ Socket: url     │                 │
     │                 │────────────────>│                 │
     │                 │                 │                 │
     │ Socket Event    │                 │                 │
     │<───────────────┤                 │                 │
     │                 │                 │                 │
     │ Navigate to URL │                 │                 │
     ├───────────────>│                 │                 │
     │                 │                 │                 │
     │ User Info       │                 │                 │
     │<───────────────┤                 │                 │
```

## Data Flow

### Session Management

```
Request → Session Middleware → Session Store → Request Object
                                    │
                                    └─> res.locals (template variables)
```

### State Management

```
Browser → Generate State → /auth/start → Include in Auth URL
                                                          │
                                                          └─> IPification
                                                          │
Callback ←────────────────────────────────────────────────┘
    │
    └─> Store User Info with State Key
    │
Complete ← Retrieve User Info ← Data Store
```

### Data Store Structure

```
Key Format:                    Value:
─────────────────────────────────────────────────────────────
{state}                        { userInfo, client_id, ... }
{state}-user-info              { raw user info object }
```

---

## Security Architecture

### Security Layers

1. **Helmet.js**: HTTP security headers
2. **Session Management**: Secure session cookies
3. **State Parameter**: Callback/result correlation; no standard web session-state comparison
4. **Input Validation**: Parameter validation
5. **Secret Keys**: Environment-based secrets

### Authentication Flow Security

```
┌─────────────────────────────────────────────────────────┐
│                    Security Measures                     │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  1. State Parameter (Result Correlation)                   │
│     - Generated on client                                │
│     - Not compared against browser-session state          │
│                                                           │
│  2. OAuth2 Authorization Code Flow                       │
│     - Short-lived authorization codes                    │
│     - Server-side token exchange                         │
│                                                           │
│  3. Session Management                                    │
│     - HttpOnly cookies                                   │
│     - Secure flag (HTTPS)                                │
│                                                           │
│  4. Secret Management                                     │
│     - Environment variables                              │
│     - Git-ignored config files                          │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

---

## Module Structure

### Application Setup

`app.js` remains the application assembly point: it validates configuration, configures shared middleware and views, and explicitly registers the route prefixes.

| Module | Responsibility |
| --- | --- |
| `middleware/appLocals.js` | Create request locals with inherited client credentials, locale, base URL, and server/flow lookup helpers |
| `bootstrap/playIntegrity.js` | Initialize and mount Play Integrity only when `PLAY_INTEGRITY_ENABLED=true`, with the configured verification and attempt services |

Request locals run before the feature and general routes. Play Integrity is mounted before the general body parsers so its own 16 KB JSON parser and safe payload error responses take precedence. The TS43 auth rate limiter remains immediately before the TS43 router, and the application error handler remains last.

### Route Modules

#### `routes/auth.js`

- **Purpose**: Register authentication endpoints; delegate HTTP handling to the web and API modules below.
- **Key Functions**:
  - `GET /auth/login`: Render login page
  - `GET /auth/start`: Initiate OAuth flow
  - `GET /auth/callback/:userFlow/:serverId`: Handle OAuth callback
  - `GET /auth/complete`: Complete authentication
  - `GET /auth/qrcode/complete`: Render QR success page
  - `GET /auth/qrcode/error`: Render QR error page
  - `POST /auth/mobile/login`: Mobile login endpoint
  - `POST /auth/s2s/signin`: Server-to-server sign-in

#### Authentication handlers and services

| Module | Responsibility |
| --- | --- |
| `routes/auth/webHandlers.js` | Login/start/callback/completion handlers, page rendering, session updates, and QR socket notifications |
| `routes/auth/apiHandlers.js` | Mobile login and S2S sign-in HTTP responses |
| `services/authService.js` | Build authorization URLs and exchange authorization codes through `utils/httpClient.js`; no Express or cache access |
| `services/authResultStore.js` | Save formatted results and raw userinfo, read S2S userinfo, and poll for completion results using the existing memory cache |

The callback exchanges the provider code and fetches userinfo before saving the formatted response under `state` and raw userinfo under `${state}-user-info`. After both writes complete, a backchannel request returns an empty 200 response. Otherwise, QR callbacks notify the desktop through Socket.IO and render the mobile result through a redirect; ordinary web callbacks redirect to `/auth/complete`. The desktop also uses `/auth/complete` to adopt the stored result into its browser session and continue to `/user/info`.

Completion polls the result cache up to five times, waiting one second after each miss, including the final miss. Reads retain the cached entries. Mobile login exchanges the code directly and returns userinfo without using this completion cache.

#### `routes/user.js`

- **Purpose**: User information display
- **Key Functions**:
  - `GET /user/info`: Display authenticated user info

#### `routes/ts43.js`

- **Purpose**: Register the TS43 endpoints and delegate to `routes/ts43/handlers.js`.
- **Key Functions**:
  - `POST /ts43/auth`: Initiate TS43 authentication
  - `POST /ts43/token`: Exchange VP token
  - `POST /ts43/log`: Logging endpoint

#### `routes/sms.js`

- **Purpose**: Register the SMS endpoints and delegate to `routes/sms/handlers.js`.
- **Key Functions**:
  - `POST /sms/auth`: Initiate SMS authentication
  - `POST /sms/token`: Submit the SMS code and exchange the CIBA request for userinfo
  - `POST /sms/log`: Logging endpoint

#### TS43 and SMS handlers and services

| Module | Responsibility |
| --- | --- |
| `routes/ts43/handlers.js`, `routes/sms/handlers.js` | Resolve server/client configuration, handle requests and responses, format display data, and update browser sessions |
| `services/ts43Service.js` | Start CIBA authentication, fetch DCQL data and build the digital request, then submit the VP callback and exchange for token/userinfo |
| `services/smsService.js` | Start CIBA SMS authentication, then submit the SMS callback and exchange for token/userinfo |

Both services expose `startAuthentication` and `exchangeToken` and operate without Express request/response objects. Provider callbacks are best-effort: a callback error is logged, then the token exchange still runs. The handlers retain the demo's existing session behavior: token/userinfo errors also populate an authenticated session with formatted error data. This extraction preserves those behaviors and the endpoint-specific error bodies; it does not introduce a shared CIBA abstraction.

### Library Modules

#### `lib/data_store.js`

- **Purpose**: Temporary data storage
- **Implementation**: In-memory cache using `cache-manager`
- **TTL**: 60 minutes
- **Usage**: Store authentication state and user information

### Utility Modules

#### `utils/authServerHelper.js`

- **Purpose**: Auth server lookup and validation utilities
- **Key Functions**:
  - `getAuthServer(authServers, serverId)`: Get server by ID or default to first
  - `getAuthServerIds(authServers)`: Get all available server IDs
  - `hasAuthServer(authServers, serverId)`: Check if server exists

#### `utils/validateConfig.js`

- **Purpose**: Configuration validation on application startup
- **Key Functions**:
  - `validateConfig(config)`: Main validation entry point
  - `validateAuthServers(authServers)`: Validate auth servers array
  - `validateClients(clients)`: Validate client configurations
  - `validateRealm(realm)`: Validate realm configuration
  - `validateCredentials(config)`: Validate OAuth credentials
- **Behavior**: Throws error and prevents app startup if validation fails

#### `utils/helpers.js`

- **Purpose**: General utility functions
- **Key Functions**:
  - `deepMerge(target, source)`: Deep merge objects
  - `findClientByUserFlow(clients, userFlow)`: Find client by flow ID
  - `findClientByClientId(clients, clientId)`: Find client by client ID

#### `utils/constants.js`

- **Purpose**: Application constants
- **Contents**: HTTP status codes, error messages, retry settings

### Socket Module

#### `socket.js`

- **Purpose**: WebSocket server for real-time communication
- **Implementation**: Socket.io
- **Channels**: Room-based (`auth:{state}`)
- **Events**:
  - `init`: Client joins room
  - `messages`: Server sends events

---

## Configuration Management

### Configuration Hierarchy

```
1. Environment Variables (.env)
2. config/default.json
3. Default values in code
```

### Configuration Validation

On application startup, configuration is validated using `utils/validateConfig.js`:

1. **Required Fields**: `realm`, `auth_servers`, `client_id`, `client_secret`, `clients`
2. **Auth Servers**: Must have at least one server with valid `id` and `url`
3. **Clients**: Must have unique `user_flow` values
4. **Behavior**: App crashes on startup if validation fails

See [Sample Config Reference](CONFIG_DEFAULT_JSON_SAMPLE.md) for field descriptions.

### Configuration Flow

```
app.js → require('config') → config/default.json
         │
         └─> res.locals → Available in templates
```

---

## Error Handling

### Error Flow

```
Error Occurred
    │
    ├─> Try-Catch Block
    │       │
    │       └─> Log Error
    │       │
    │       └─> Error Handler Middleware
    │               │
    │               └─> HTTP Error Response
    │
    └─> OAuth Errors
            │
            └─> Redirect to Login with Error Message
```

---

## Performance Considerations

### Caching Strategy

- **Data Store**: In-memory cache with 60-minute TTL
- **Session Store**: Memory-based (consider Redis for production)
- **Static Assets**: Express static middleware

### Optimization Opportunities

1. **Redis Integration**: Replace in-memory cache with Redis
2. **Session Store**: Use Redis session store for scalability
3. **Rate Limiting**: Implement rate limiting middleware
4. **Connection Pooling**: Configure HTTP client connection pooling

---

## Deployment Architecture

### Docker Deployment

```
┌─────────────────────────────────────────┐
│         Docker Compose Stack             │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────┐      ┌─────────────┐  │
│  │   App       │──────│   Redis     │  │
│  │  Container  │      │  Container  │  │
│  │  Port: 8080 │      │  Port: 6379 │  │
│  └─────────────┘      └─────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

### Production Considerations

1. **Environment Variables**: Use secrets management
2. **HTTPS**: Configure reverse proxy (nginx/traefik)
3. **Load Balancing**: Multiple app instances
4. **Monitoring**: Application performance monitoring
5. **Logging**: Centralized logging system

---

## Extension Points

### Adding New User Flows

1. Add client configuration to `config/default.json` (see [Sample Config Reference](CONFIG_DEFAULT_JSON_SAMPLE.md))
2. Add UI button in `views/login.pug`
3. Add JavaScript handler in `public/js/login.js`
4. Flow automatically handled by existing routes

### Adding New Authentication Methods

1. Extend `routes/auth.js` with new endpoint
2. Implement OAuth2/OIDC flow
3. Add UI components
4. Update documentation

### Customizing User Info Display

1. Modify `views/info.pug` template
2. Update `routes/user.js` if needed
3. Customize styling in `public/css/`

---

## Dependencies

### Core Dependencies

- **express**: Web framework
- **express-session**: Session management
- **socket.io**: WebSocket server
- **axios**: HTTP client
- **pug**: Template engine
- **config**: Configuration management

### Security Dependencies

- **helmet**: Security headers
- **cookie-parser**: Cookie parsing

### Utility Dependencies

- **uuid**: UUID generation
- **geoip-lite**: GeoIP lookup
- **cache-manager**: Caching abstraction

---

## Future Enhancements

1. **Redis Integration**: Replace in-memory cache
2. **Rate Limiting**: Add rate limiting middleware
3. **API Versioning**: Implement API versioning
4. **OpenAPI Documentation**: Generate OpenAPI specs
5. **Testing**: Add unit and integration tests
6. **Monitoring**: Add application monitoring
7. **Logging**: Structured logging with correlation IDs

</details>
