const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createPlayIntegrityService,
  PlayIntegrityUnavailableError,
} = require('../../services/playIntegrityService');

const validInput = {
  integrityToken: 'opaque-integrity-token',
  expectedRequestHash: 'expected-request-hash',
  expectedPackageName: 'com.example.demo',
  maxAgeMs: 120_000,
};

const fixedNow = new Date('2026-09-10T10:00:00.000Z');

function decodedFixture(overrides = {}) {
  return {
    tokenPayloadExternal: {
      requestDetails: {
        requestHash: validInput.expectedRequestHash,
        requestPackageName: validInput.expectedPackageName,
        timestampMillis: String(fixedNow.getTime()),
      },
      appIntegrity: { appRecognitionVerdict: 'PLAY_RECOGNIZED' },
      deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] },
      accountDetails: { appLicensingVerdict: 'LICENSED' },
      ...overrides,
    },
  };
}

function createService({ decoded = decodedFixture(), authError, httpError, requireLicensedApp = false } = {}) {
  const authClient = {
    async getAccessToken() {
      if (authError) throw authError;
      return { token: 'access-token' };
    },
  };
  const httpClient = {
    async post() {
      if (httpError) throw httpError;
      return { data: decoded };
    },
  };
  return {
    service: createPlayIntegrityService({
      packageName: 'com.example.demo',
      requireLicensedApp,
      authClient,
      httpClient,
      timeoutMs: 10_000,
      now: () => fixedNow,
    }),
    httpClient,
  };
}

test('allows a recognized app with matching hash and device integrity', async () => {
  const { service } = createService();

  const result = await service.verify(validInput);

  assert.deepEqual(result, {
    decision: 'allow',
    reasonCodes: [],
    requestHashMatched: true,
    verdict: {
      appRecognition: 'PLAY_RECOGNIZED',
      deviceIntegrity: ['MEETS_DEVICE_INTEGRITY'],
      appLicensing: 'LICENSED',
    },
  });
});

test('denies a mismatched package or stale timestamp', async () => {
  const { service: mismatchedPackage } = createService({
    decoded: decodedFixture({ requestDetails: {
      requestHash: validInput.expectedRequestHash,
      requestPackageName: 'com.other.demo',
      timestampMillis: String(fixedNow.getTime()),
    } }),
  });
  const { service: stale } = createService({
    decoded: decodedFixture({ requestDetails: {
      requestHash: validInput.expectedRequestHash,
      requestPackageName: validInput.expectedPackageName,
      timestampMillis: String(fixedNow.getTime() - validInput.maxAgeMs - 1),
    } }),
  });

  assert.deepEqual((await mismatchedPackage.verify(validInput)).reasonCodes, ['PACKAGE_NAME_MISMATCH']);
  assert.deepEqual((await stale.verify(validInput)).reasonCodes, ['REQUEST_TOO_OLD']);
});

test('denies a mismatched request hash before other policy failures', async () => {
  const { service } = createService({
    decoded: decodedFixture({
      requestDetails: {
        requestHash: 'wrong-hash',
        requestPackageName: validInput.expectedPackageName,
        timestampMillis: String(fixedNow.getTime()),
      },
      appIntegrity: { appRecognitionVerdict: 'UNRECOGNIZED_VERSION' },
      deviceIntegrity: { deviceRecognitionVerdict: [] },
      accountDetails: { appLicensingVerdict: 'UNLICENSED' },
    }),
    requireLicensedApp: true,
  });

  const result = await service.verify(validInput);

  assert.deepEqual(result.reasonCodes, [
    'REQUEST_HASH_MISMATCH',
    'APP_NOT_RECOGNIZED',
    'DEVICE_INTEGRITY_NOT_MET',
    'APP_NOT_LICENSED',
  ]);
  assert.equal(result.decision, 'deny');
  assert.equal(result.requestHashMatched, false);
});

test('denies missing app or device verdicts', async () => {
  const { service } = createService({
    decoded: decodedFixture({
      appIntegrity: {},
      deviceIntegrity: {},
    }),
  });

  const result = await service.verify(validInput);

  assert.equal(result.decision, 'deny');
  assert.deepEqual(result.reasonCodes, [
    'APP_NOT_RECOGNIZED',
    'DEVICE_INTEGRITY_NOT_MET',
  ]);
  assert.deepEqual(result.verdict, {
    appRecognition: null,
    deviceIntegrity: [],
    appLicensing: 'LICENSED',
  });
});

test('denies an unlicensed app only when strict licensing is enabled', async () => {
  const { service } = createService({
    decoded: decodedFixture({ accountDetails: { appLicensingVerdict: 'UNLICENSED' } }),
    requireLicensedApp: true,
  });

  const result = await service.verify(validInput);

  assert.equal(result.decision, 'deny');
  assert.deepEqual(result.reasonCodes, ['APP_NOT_LICENSED']);
});

test('does not expose decoded payloads or access tokens in normal results', async () => {
  const { service } = createService();

  const serialized = JSON.stringify(await service.verify(validInput));

  assert.doesNotMatch(serialized, /access-token/);
  assert.doesNotMatch(serialized, /tokenPayloadExternal/);
});

test('does not write decoded Play Integrity verdicts to stdout', async () => {
  const { service } = createService();
  const originalLog = console.log;
  let logCalls = 0;
  console.log = () => { logCalls += 1; };

  try {
    await service.verify(validInput);
  } finally {
    console.log = originalLog;
  }

  assert.equal(logCalls, 0);
});

test('maps authentication failures to unavailable credential errors', async () => {
  const { service } = createService({ authError: new Error('credential details') });

  await assert.rejects(
    service.verify(validInput),
    (error) => error instanceof PlayIntegrityUnavailableError
      && error.reasonCode === 'GOOGLE_CREDENTIALS_UNAVAILABLE'
      && !JSON.stringify(error).includes('credential details'),
  );
});

test('maps decode network failures to unavailable decode errors', async () => {
  const { service } = createService({ httpError: new Error('network response body') });

  await assert.rejects(
    service.verify(validInput),
    (error) => error instanceof PlayIntegrityUnavailableError
      && error.reasonCode === 'GOOGLE_DECODE_FAILED'
      && !JSON.stringify(error).includes('network response body'),
  );
});

test('maps decode timeout failures to unavailable timeout errors', async () => {
  const timeoutError = new Error('request timed out');
  timeoutError.code = 'ECONNABORTED';
  const { service } = createService({ httpError: timeoutError });

  await assert.rejects(
    service.verify(validInput),
    (error) => error instanceof PlayIntegrityUnavailableError
      && error.reasonCode === 'GOOGLE_DECODE_TIMEOUT',
  );
});

test('maps ETIMEDOUT decode failures to unavailable timeout errors', async () => {
  const timeoutError = new Error('request timed out');
  timeoutError.code = 'ETIMEDOUT';
  const { service } = createService({ httpError: timeoutError });

  await assert.rejects(
    service.verify(validInput),
    (error) => error instanceof PlayIntegrityUnavailableError
      && error.reasonCode === 'GOOGLE_DECODE_TIMEOUT',
  );
});
