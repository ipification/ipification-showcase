# Desktop QR and polling

[Guide home](README.md) · [Browser flows](browser-flows.md)

QR connects two separate browser contexts. The desktop prepares the attempt and owns its cookie; the phone scans the QR and visits the showcase's start URL. The phone completes authorization and callback, while the desktop checks the result. The QR does not contain the client secret.

```mermaid
sequenceDiagram
    participant D as Desktop browser
    participant S as Showcase backend and memory store
    participant P as Phone browser
    participant I as IPification
    D->>S: POST /auth/prepare (qr=true)
    S-->>D: state, start URL, owner cookie, expiry
    D->>S: GET /auth/status?state=... (every 2s)
    D-->>P: QR with start URL
    P->>S: GET start URL
    S-->>P: redirect to provider
    P->>I: authenticate
    I-->>P: callback with code or error
    P->>S: callback; backend stores outcome
    D->>S: GET /auth/status?state=...
    S-->>D: terminal status and completion URL
    D->>S: GET /auth/complete?state=...
    S-->>D: display session and result redirect
```

The backend allows **two minutes to start scanning**. Once the phone starts the attempt, a separate five-minute completion window starts. Provider timeouts may differ. A fresh QR requires a fresh attempt. These values are showcase behavior, not a provider-wide expiry guarantee.

The initiating browser polls immediately and then every two seconds. `GET /auth/status?state=...` checks the state, the per-attempt owner cookie, expiry and request origin. It does not bind by client IP. After completion, an authenticated display session with the exact state may report `finished`. A different browser knowing only the state cannot normally read the status. The response is private and not cached. Keep the cookie on the initiating browser and use the same origin throughout; do not copy it to the phone.

For local testing, open the desktop app with a LAN IP or hostname reachable from the phone **before generating the QR**. `localhost` in a QR refers to the phone itself. The provider must also accept the exact callback URL. See [running locally](running.md). QR/polling are showcase implementation choices: a customer can use a different secure completion mechanism.

See [polling implementation](../../src/features/auth/auth-status.ts), [QR dialog](../../src/features/qr/qr-dialog.tsx), [attempt storage](../../src/server/auth/attempts.ts), and [status handler](../../src/server/auth/web.ts).

The phone result page currently treats the string `"false"` as failure but boolean `false` as success, while the desktop result preserves and displays the original userinfo. This legacy-compatible behavior is covered by a contract test; do not use the phone result page as the verification decision. Apply your own provider-claim policy.
