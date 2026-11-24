# Showcase HTTP and TypeScript reference

Use this reference to find the Express Showcase endpoint for each integration step and the TypeScript handler that implements it. Send the HTTP requests to your Showcase deployment. The function signatures show the server-side interface. Client request fields and response behavior are described in each handler's documentation.

| Task | Showcase path |
| --- | --- |
| {@link "Browser authorization"!prepareWebAuthentication Start browser authorization or show a QR code} | `POST /auth/prepare`, then navigate to or show the URL returned by the server |
| {@link "Browser authorization"!getAuthenticationStatus Follow a browser attempt} | `GET /auth/status`, then navigate to the returned completion URL |
| {@link "Mobile code exchange"!exchangeMobileCode Exchange a code from an existing mobile authorization} | `POST /auth/mobile/login` |
| {@link "Server-to-server results"!POST Read userinfo stored by a browser callback} | `POST /auth/s2s/signin` |
| {@link "SMS verification"!sendSmsCode Verify an SMS code} | `POST /sms/auth`, then `POST /sms/token` |
| {@link "SIM verification"!createSimCredentialRequest Verify a SIM credential} | `POST /ts43/auth`, then `POST /ts43/token` |
| {@link "Play Integrity"!handleIntegrity Verify Android Play Integrity before exchanging a code} | `POST /api/play-integrity/attempt`, `/api/play-integrity/verify`, then `/api/play-integrity/token-exchange` |
| {@link "Showcase configuration"!GET Discover the demo configuration or default country} | `GET /api/config` or `GET /api/geoip` |

Keep cookies across browser steps and check the HTTP status before parsing a response. Provider claims depend on the selected scope. Apply your application's verification policy to those claims.

The repository's `docs/integration/` directory contains walkthroughs, request examples, and deployment notes.
