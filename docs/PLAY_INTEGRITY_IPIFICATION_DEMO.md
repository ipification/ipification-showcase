# Google Play Integrity + IPification — mobile demo

This document describes an Android demo that checks Google Play Integrity before starting an IPification authentication.

## Scope

The demo intentionally does **not** implement a pre-auth session or an authenticated-user session.

- Each attempt is short-lived and single-use.
- The backend persists attempts and transactions in Redis or a database.
- The demo proves that a Google verdict is bound to an immutable IPification operation.
- It does **not** prove that the operation belongs to a specific logged-in user or device owner.

> Production must bind the attempt and signed state to either an authenticated user session or a short-lived verification session. An unguessable `attemptId` is an identifier, not a replacement for an authenticated credential.

## Google Standard API model

Google Standard Integrity API has two different artifacts:

| Artifact | Lifetime and use |
| --- | --- |
| `StandardIntegrityTokenProvider` | Prepare ahead of time; retain in app memory and reuse to request verdicts. |
| `integrityToken` | Request fresh for every protected operation; send once to backend for Google decode. |

Google requires the backend to compare the decoded request package name, request hash, and token timestamp against the original request before evaluating app/device verdicts. The request hash binds the integrity token to a specific action rather than merely to a device.

References: [Standard API guide](https://developer.android.com/google/play/integrity/standard), [Integrity verdicts](https://developer.android.com/google/play/integrity/verdicts), and [Play Integrity setup](https://developer.android.com/google/play/integrity/setup).

## End-to-end demo flow

```text
Android app                   Client backend                 Google / IPification
    |                                |                                  |
    | POST /integrity/attempt        |                                  |
    |------------------------------->| store immutable attempt snapshot |
    |<-------------------------------| attemptId + requestHash           |
    |                                |                                  |
    | request fresh integrity token  |                                  |
    |--------------------------------------------------------------->Google|
    |<---------------------------------------------------------------Google|
    |                                |                                  |
    | POST /integrity/verify         |                                  |
    |------------------------------->| decode token -------------------> Google
    |                                | validate verdict + snapshot       |
    |<-------------------------------| signed state                      |
    | setState(state), start auth    |                                  |
    |----------------------------------------------------------> IPification
    |<--------------------------------------------------------- code + state |
    | POST /ipification/token-exchange                          |
    |------------------------------->| validate and consume state        |
    |                                | exchange code -----------------> IPification
    |<-------------------------------| ALLOW / REVIEW / DENY             |
```

## 1. Android: prepare the token provider

Prepare the provider on app launch or in background, not every time the user starts authentication.

```kotlin
val integrityManager = IntegrityManagerFactory.createStandard(applicationContext)

integrityManager.prepareIntegrityToken(
  PrepareIntegrityTokenRequest.builder()
    .setCloudProjectNumber(CLOUD_PROJECT_NUMBER)
    .build()
).addOnSuccessListener { provider ->
  integrityTokenProvider = provider
}
```

The provider is memory-only. If the app process restarts, prepare it again. If token request returns `INTEGRITY_TOKEN_PROVIDER_INVALID`, prepare a new provider before retrying.

## 2. Create an attempt and immutable snapshot

The mobile app starts a new attempt:

```http
POST /api/security/integrity/attempt
Content-Type: application/json

{
  "action": "IPIFICATION_AUTH",
  "operationId": "verification-intent-uuid"
}
```

`operationId` is an application-level ID. The backend resolves it to data needed for the verification, such as a normalized E.164 phone number, then stores an immutable snapshot:

```js
attempt = {
  id: "attempt-uuid",
  action: "IPIFICATION_AUTH",
  operationId: "verification-intent-uuid",
  operationSnapshot: {
    phoneNumberE164: "+849...",
    version: 1,
  },
  challenge: "random-base64url",
  expectedRequestHash: "sha256-base64url",
  status: "created",
  expiresAt: "2026-09-10T10:30:00Z",
};
```

The hash has fixed UTF-8 serialization. Both sides must use exactly the same order and encoding:

```text
requestHash = base64url(SHA-256(UTF-8(JSON.stringify([
  action,
  attemptId,
  challenge,
  operationData
]))))
```

The backend should calculate the hash and return it; Android should use that exact string.

```json
{
  "attemptId": "attempt-uuid",
  "requestHash": "sha256-base64url",
  "expiresAt": "2026-09-10T10:30:00Z"
}
```

Do not put raw PII into `requestHash`; hash it. Google limits `requestHash` to 500 bytes.

## 3. Android: request a fresh integrity token

```kotlin
val token = integrityTokenProvider.request(
  StandardIntegrityTokenRequest.builder()
    .setRequestHash(attempt.requestHash)
    .build()
).await().token()
```

Never cache, log, or reuse this token.

## 4. Backend: verify the token and issue signed state

```http
POST /api/security/integrity/verify
Content-Type: application/json

{
  "attemptId": "attempt-uuid",
  "integrityToken": "..."
}
```

Google decode returns `tokenPayloadExternal`, with relevant data shaped like:

```json
{
  "requestDetails": {
    "requestPackageName": "com.example.app",
    "requestHash": "...",
    "timestampMillis": "1760000000000"
  },
  "appIntegrity": {
    "appRecognitionVerdict": "PLAY_RECOGNIZED"
  },
  "deviceIntegrity": {
    "deviceRecognitionVerdict": ["MEETS_DEVICE_INTEGRITY"]
  },
  "accountDetails": {
    "appLicensingVerdict": "LICENSED"
  }
}
```

The backend must perform these checks in order:

1. Atomically claim the attempt: accept only `created` and unexpired attempts, then change it to `verifying`.
2. Recompute `expectedRequestHash` from the server-side immutable snapshot. Never accept a hash, action, or phone number from the verify request as the expected value.
3. Decode the integrity token via Google with backend credentials.
4. Check `requestPackageName`, `requestHash`, and `timestampMillis` against expected server values.
5. Enforce policy, for example `PLAY_RECOGNIZED`, `MEETS_DEVICE_INTEGRITY`, and optionally `LICENSED`.
6. On success, atomically create a single-use transaction and return an expiring signed state. On failure, mark the attempt rejected and return no state.

### Node.js service demo

Install the Google authentication library on the backend:

```bash
yarn add google-auth-library
```

```js
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { GoogleAuth } from "google-auth-library";

const googleAuth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/playintegrity"],
});

const equal = (left, right) => {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
};

const decodeIntegrityToken = async (integrityToken) => {
  const packageName = process.env.PLAY_INTEGRITY_PACKAGE_NAME;
  const client = await googleAuth.getClient();

  const response = await client.request({
    method: "POST",
    url: `https://playintegrity.googleapis.com/v1/${encodeURIComponent(
      packageName,
    )}:decodeIntegrityToken`,
    data: { integrityToken },
    timeout: 10_000,
  });

  return response.data.tokenPayloadExternal;
};

const verifyIntegrityAttempt = async ({ attempt, integrityToken }) => {
  if (attempt.action !== "IPIFICATION_AUTH") {
    return { ok: false, reason: "ACTION_MISMATCH" };
  }

  if (new Date(attempt.expiresAt) <= new Date()) {
    return { ok: false, reason: "ATTEMPT_EXPIRED" };
  }

  const payload = await decodeIntegrityToken(integrityToken);
  const request = payload?.requestDetails;
  const app = payload?.appIntegrity;
  const device = payload?.deviceIntegrity;
  const account = payload?.accountDetails;
  const timestamp = Number(request?.timestampMillis);
  const maxAgeMs = Number(process.env.PLAY_INTEGRITY_MAX_AGE_MS || 120_000);

  const isFresh =
    Number.isFinite(timestamp) &&
    timestamp <= Date.now() &&
    Date.now() - timestamp <= maxAgeMs;

  const isExpectedPackage =
    request?.requestPackageName === process.env.PLAY_INTEGRITY_PACKAGE_NAME;
  const isExpectedHash = equal(request?.requestHash, attempt.expectedRequestHash);
  const isRecognizedApp = app?.appRecognitionVerdict === "PLAY_RECOGNIZED";
  const meetsDeviceIntegrity =
    device?.deviceRecognitionVerdict?.includes("MEETS_DEVICE_INTEGRITY") === true;
  const needsLicensedApp =
    process.env.PLAY_INTEGRITY_REQUIRE_LICENSED_APP === "true";
  const isLicensed =
    !needsLicensedApp || account?.appLicensingVerdict === "LICENSED";

  if (!isExpectedPackage || !isExpectedHash || !isFresh ||
      !isRecognizedApp || !meetsDeviceIntegrity || !isLicensed) {
    return { ok: false, reason: "INTEGRITY_POLICY_REJECTED" };
  }

  return { ok: true };
};

const createSignedState = ({ transactionId, attempt }) =>
  jwt.sign(
    {
      typ: "IPIFICATION_AUTH",
      tx: transactionId,
      aid: attempt.id,
      act: attempt.action,
    },
    process.env.IPIFICATION_STATE_SIGNING_SECRET,
    {
      algorithm: "HS512",
      expiresIn: "120s",
      issuer: "client-backend",
      audience: "ipification-sdk",
      jwtid: crypto.randomUUID(),
    },
  );

export { verifyIntegrityAttempt, createSignedState };
```

### Controller outline

```js
const handleVerifyIntegrity = async (req, res) => {
  const { attemptId, integrityToken } = req.body;

  // Atomic compare-and-set: created -> verifying.
  const attempt = await attemptRepository.claimForVerification({ attemptId });

  if (!attempt) {
    return res.status(409).send({
      error_message: "Attempt is expired or already used.",
    });
  }

  try {
    const result = await verifyIntegrityAttempt({ attempt, integrityToken });

    if (!result.ok) {
      await attemptRepository.reject(attempt.id, result.reason);
      return res.status(403).send({ error_message: "Integrity was rejected." });
    }

    const transaction = await transactionRepository.createApproved({
      attemptId: attempt.id,
      action: attempt.action,
      expiresAt: attempt.expiresAt,
    });

    return res.status(201).send({
      state: createSignedState({ transactionId: transaction.id, attempt }),
      expiresAt: transaction.expiresAt,
    });
  } catch {
    await attemptRepository.reject(attempt.id, "GOOGLE_DECODE_FAILED");
    return res.status(503).send({
      error_message: "Integrity temporarily unavailable.",
    });
  }
};
```

## Why this prevents changed data

| Change or attack | Defense |
| --- | --- |
| Change the phone number after requesting token | Google verdict contains the old request hash; it differs from backend's attempt snapshot hash. |
| Change `action` to use a weaker policy | Action comes from the stored attempt, not the request body. |
| Verify the same attempt twice | Atomic status transition rejects the second request. |
| Reuse the resulting state | The token exchange atomically consumes the transaction. |
| Reuse a Google integrity token | Google provides replay protection; backend also permits only one verification per attempt. |

## 5. Start IPification and complete

Android immediately passes the state to the SDK:

```kotlin
ipificationSdk.setState(state)
ipificationSdk.startAuthentication()
```

When the SDK returns `code` and `state`:

```http
POST /api/ipification/token-exchange
Content-Type: application/json

{
  "code": "<authorization-code>",
  "state": "<signed-state>"
}
```

The backend verifies the state signature, expiry, action, attempt/transaction relation, and transaction status. It atomically changes the transaction to `exchanging` before exchanging `code` with IPification. A used, changed, or expired state is rejected.

## State machine

```text
created -> verifying -> approved -> exchanging -> completed
    |          |             |
    +--------> rejected <----+
    |
    +--------> expired
```

## Security rules

- Never log integrity tokens, raw decoded Google payloads, IPification authorization codes, signed states, or credentials.
- Use Application Default Credentials or Workload Identity for Google service authentication; never ship credentials in the Android app.
- Keep attempt, transaction, and state TTLs short.
- Use Redis/database atomic operations, not an in-memory `Map`, when the backend has multiple instances.
- A demo without user/pre-auth session has no user ownership binding. Add it before production.

