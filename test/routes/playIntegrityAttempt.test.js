const http = require('node:http');
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { PlayIntegrityUnavailableError } = require('../../services/playIntegrityService');
const { createPlayIntegrityAttemptService } = require('../../services/playIntegrityAttemptService');
const { createPlayIntegrityRouter } = require('../../routes/playIntegrity');

const publicAttempt = {
  attemptId: 'attempt-id',
  requestHash: 'expected-request-hash',
  expiresAt: '2026-09-10T10:02:00.000Z',
};

const frozenAttempt = Object.freeze({
  id: publicAttempt.attemptId,
  action: 'IPIFICATION_AUTH',
  requestHash: publicAttempt.requestHash,
  expiresAt: publicAttempt.expiresAt,
  clientId: 'demo',
  serverId: 'stage',
  client: Object.freeze({
    id: 'demo',
    client_id: 'demo',
    client_secret: 'snapshot-client-secret',
    redirectUri: 'https://client.example/callback',
  }),
  server: Object.freeze({
    id: 'stage',
    url: 'https://server.example/auth',
    realm: 'ipification',
  }),
});

function createAttemptService(overrides = {}) {
  return {
    createAttempt: async () => publicAttempt,
    claimAttempt: async () => frozenAttempt,
    rejectAttempt: async () => frozenAttempt,
    approveAttempt: async () => ({
      id: 'transaction-id',
      attempt: frozenAttempt,
      status: 'approved',
      expiresAt: publicAttempt.expiresAt,
    }),
    createSignedState: () => 'signed.state.value',
    claimTransaction: async () => ({ status: 'claimed', transaction: {
      id: 'transaction-id', attempt: frozenAttempt, status: 'exchanging',
    } }),
    completeTransaction: async () => undefined,
    ...overrides,
  };
}

function createRealAttemptService() {
  const values = new Map();
  return createPlayIntegrityAttemptService({
    dataStore: {
      get: async (key) => values.get(key),
      set: async (key, value) => values.set(key, value),
    },
    stateSecret: 'trusted-state-secret',
    stateIssuer: 'ipification-demo',
    stateAudience: 'ipification-sdk',
  });
}

function createRouter({ attemptService, verify, exchangeCodeAndGetUserInfo, logCompletion, bypassVerification, logVerificationFailure } = {}) {
  return createPlayIntegrityRouter({
    attemptService: attemptService || createAttemptService(),
    verify: verify || (async () => ({ decision: 'allow', reasonCodes: [] })),
    exchangeCodeAndGetUserInfo: exchangeCodeAndGetUserInfo || (async () => ({ userInfo: {} })),
    expectedPackageName: 'com.example.demo',
    userFlow: 'mobile',
    bypassVerification,
    maxAgeMs: 120_000,
    requestIdFactory: () => 'request-id',
    logCompletion,
    logVerificationFailure,
  });
}

async function withServer(router, run) {
  const app = express();
  app.use((req, res, next) => {
    res.locals = {
      clients: [{ client_id: 'demo', client_secret: 'runtime-client-secret', user_flow: 'mobile' }],
      getAuthServer: (serverId) => serverId === 'stage'
        ? { id: 'stage', url: 'https://runtime.example/auth' }
        : null,
      realm: 'runtime-realm',
      baseUrl: 'https://showcase.example',
    };
    next();
  });
  app.use('/api/play-integrity', router);
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const post = async (path, body) => fetch(`http://127.0.0.1:${port}/api/play-integrity${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  try {
    await run(post);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('attempt rejects a missing serverId and never creates storage', async () => {
  let createCalls = 0;
  const router = createRouter({
    attemptService: createAttemptService({ createAttempt: async () => { createCalls += 1; } }),
  });

  await withServer(router, async (post) => {
    const response = await post('/attempt', { phone_number: '+84901234567' });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      request_id: 'request-id', decision: 'deny', reason_codes: ['INVALID_REQUEST'],
    });
  });

  assert.equal(createCalls, 0);
});

test('attempt resolves its configured user flow without accepting client_id', async () => {
  let received;
  const router = createRouter({
    attemptService: createAttemptService({
      createAttempt: async (input) => {
        received = input;
        return publicAttempt;
      },
    }),
  });

  await withServer(router, async (post) => {
    const response = await post('/attempt', {
      phone_number: '+84901234567', server_id: 'stage',
    });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      attempt_id: publicAttempt.attemptId,
      request_hash: publicAttempt.requestHash,
      expires_at: publicAttempt.expiresAt,
    });
  });

  assert.equal(received.phoneNumber, '+84901234567');
  assert.equal(received.clientId, 'demo');
  assert.equal(received.serverId, 'stage');
  assert.equal(received.resolveClient().user_flow, 'mobile');
});

test('verify issues state only after a matching verdict', async () => {
  let verifyInput;
  const router = createRouter({
    verify: async (input) => {
      verifyInput = input;
      return { decision: 'allow', reasonCodes: [] };
    },
  });

  await withServer(router, async (post) => {
    const response = await post('/verify', { attempt_id: publicAttempt.attemptId, integrity_token: 'opaque' });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      state: 'signed.state.value', expires_at: publicAttempt.expiresAt,
    });
  });

  assert.deepEqual(verifyInput, {
    integrityToken: 'opaque',
    expectedRequestHash: publicAttempt.requestHash,
    expectedPackageName: 'com.example.demo',
    maxAgeMs: 120_000,
  });
});

test('verify bypass issues state without calling Google verification', async () => {
  let verifyCalls = 0;
  const router = createRouter({
    bypassVerification: true,
    verify: async () => { verifyCalls += 1; throw new Error('Google must not be called'); },
  });

  await withServer(router, async (post) => {
    const response = await post('/verify', { attempt_id: publicAttempt.attemptId, integrity_token: 'opaque' });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      state: 'signed.state.value', expires_at: publicAttempt.expiresAt,
    });
  });

  assert.equal(verifyCalls, 0);
});

test('verify logs the safe upstream error details without the integrity token', async () => {
  const events = [];
  const router = createRouter({
    verify: async () => { throw new PlayIntegrityUnavailableError('GOOGLE_DECODE_FAILED', new Error('upstream unavailable: opaque-secret-token')); },
    logVerificationFailure: (event) => events.push(event),
  });

  await withServer(router, async (post) => {
    const response = await post('/verify', { attempt_id: publicAttempt.attemptId, integrity_token: 'opaque-secret-token' });
    assert.equal(response.status, 503);
  });

  assert.deepEqual(events, [{
    request_id: 'request-id',
    reason_code: 'GOOGLE_DECODE_FAILED',
    error_name: 'Error',
    error_message: 'upstream unavailable: [REDACTED]',
  }]);
  assert.equal(JSON.stringify(events).includes('opaque-secret-token'), false);
});

test('verify denies a hash mismatch without issuing state', async () => {
  let rejectedReason;
  let approved = 0;
  const router = createRouter({
    attemptService: createAttemptService({
      rejectAttempt: async (_, reason) => { rejectedReason = reason; },
      approveAttempt: async () => { approved += 1; },
    }),
    verify: async () => ({ decision: 'deny', reasonCodes: ['REQUEST_HASH_MISMATCH'] }),
  });

  await withServer(router, async (post) => {
    const response = await post('/verify', { attempt_id: publicAttempt.attemptId, integrity_token: 'opaque' });
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(Object.hasOwn(body, 'state'), false);
    assert.deepEqual(body, {
      request_id: 'request-id', decision: 'deny', reason_codes: ['REQUEST_HASH_MISMATCH'],
    });
  });

  assert.equal(rejectedReason, 'REQUEST_HASH_MISMATCH');
  assert.equal(approved, 0);
});

test('verify rejects an expired or claimed attempt before Google is called', async () => {
  let verifyCalls = 0;
  const router = createRouter({
    attemptService: createAttemptService({ claimAttempt: async () => null }),
    verify: async () => { verifyCalls += 1; },
  });

  await withServer(router, async (post) => {
    const response = await post('/verify', { attempt_id: publicAttempt.attemptId, integrity_token: 'opaque' });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      request_id: 'request-id', decision: 'deny', reason_codes: ['ATTEMPT_UNAVAILABLE'],
    });
  });

  assert.equal(verifyCalls, 0);
});

test('verify maps unavailable Google verification without exposing its input', async () => {
  const router = createRouter({
    verify: async () => {
      throw new PlayIntegrityUnavailableError('GOOGLE_DECODE_FAILED', new Error('opaque'));
    },
  });

  await withServer(router, async (post) => {
    const response = await post('/verify', { attempt_id: publicAttempt.attemptId, integrity_token: 'opaque' });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      request_id: 'request-id', decision: 'unavailable', reason_codes: ['GOOGLE_DECODE_FAILED'],
    });
  });
});

test('token exchange rejects invalid state', async () => {
  let exchangeCalls = 0;
  const router = createRouter({
    exchangeCodeAndGetUserInfo: async () => { exchangeCalls += 1; },
  });

  await withServer(router, async (post) => {
    const response = await post('/token-exchange', { code: 'input', state: '' });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      request_id: 'request-id', decision: 'deny', reason_codes: ['INVALID_REQUEST'],
    });
  });

  assert.equal(exchangeCalls, 0);
});

test('token exchange rejects a forged compact JWT as invalid state', async () => {
  let exchangeCalls = 0;
  const router = createRouter({
    attemptService: createRealAttemptService(),
    exchangeCodeAndGetUserInfo: async () => { exchangeCalls += 1; },
  });
  const forgedState = jwt.sign(
    { typ: 'IPIFICATION_AUTH', tx: 'forged-transaction', aid: 'forged-attempt', act: 'IPIFICATION_AUTH' },
    'untrusted-state-secret',
    { algorithm: 'HS512', issuer: 'ipification-demo', audience: 'ipification-sdk' },
  );

  await withServer(router, async (post) => {
    const response = await post('/token-exchange', { code: 'input', state: forgedState });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      request_id: 'request-id', decision: 'deny', reason_codes: ['INVALID_STATE'],
    });
  });

  assert.equal(exchangeCalls, 0);
});

test('token exchange rejects reuse before a second IPification call', async () => {
  let claims = 0;
  const exchangeInputs = [];
  const completions = [];
  const router = createRouter({
    attemptService: createAttemptService({
      claimTransaction: async () => (claims++ === 0 ? { status: 'claimed', transaction: {
        id: 'transaction-id', attempt: frozenAttempt, status: 'exchanging',
      } } : { status: 'unavailable' }),
      completeTransaction: async (...input) => completions.push(input),
    }),
    exchangeCodeAndGetUserInfo: async (...input) => {
      exchangeInputs.push(input);
      return { userInfo: { subject: 'not-returned' } };
    },
  });

  await withServer(router, async (post) => {
    const first = await post('/token-exchange', { code: 'input', state: 'signed.state.value' });
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { decision: 'allow' });

    const reused = await post('/token-exchange', { code: 'different-input', state: 'signed.state.value' });
    assert.equal(reused.status, 409);
    assert.deepEqual(await reused.json(), {
      request_id: 'request-id', decision: 'deny', reason_codes: ['TRANSACTION_UNAVAILABLE'],
    });
  });

  assert.deepEqual(exchangeInputs, [[
    'https://server.example/auth/realms/ipification/protocol/openid-connect/token',
    'https://server.example/auth/realms/ipification/protocol/openid-connect/userinfo',
    {
      code: 'input',
      redirect_uri: 'https://client.example/callback',
      grant_type: 'authorization_code',
      client_id: 'demo',
      client_secret: 'snapshot-client-secret',
    },
  ]]);
  assert.deepEqual(completions, [['transaction-id', 'consumed']]);
});

test('token exchange records a failed transaction without exposing the dependency error', async () => {
  const completions = [];
  const router = createRouter({
    attemptService: createAttemptService({
      completeTransaction: async (...input) => completions.push(input),
    }),
    exchangeCodeAndGetUserInfo: async () => { throw new Error('dependency details'); },
  });

  await withServer(router, async (post) => {
    const response = await post('/token-exchange', { code: 'input', state: 'signed.state.value' });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      request_id: 'request-id', decision: 'deny', reason_codes: ['IPIFICATION_EXCHANGE_FAILED'],
    });
  });

  assert.deepEqual(completions, [['transaction-id', 'failed']]);
});

test('responses and completion logs omit sensitive request values', async () => {
  const events = [];
  const router = createRouter({ logCompletion: (event) => events.push(event) });

  await withServer(router, async (post) => {
    const response = await post('/attempt', {
      phone_number: '+84901234567', server_id: 'stage',
    });
    assert.equal(response.status, 201);
    const body = JSON.stringify(await response.json());
    assert.doesNotMatch(body, /\+84901234567|runtime-client-secret|snapshot-client-secret/);
  });

  assert.deepEqual(events, [{
    requestId: 'request-id', endpoint: 'attempt', decision: 'allow', reasonCodes: [], duration: events[0].duration,
  }]);
  assert.equal(typeof events[0].duration, 'number');
  assert.doesNotMatch(JSON.stringify(events), /\+84901234567|runtime-client-secret|snapshot-client-secret/);
});
