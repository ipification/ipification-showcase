const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const {
  createPlayIntegrityAttemptService,
} = require('../../services/playIntegrityAttemptService');

const stateSecret = 'test-state-secret-that-is-long-enough';
const fixedNow = new Date('2026-09-10T10:00:00.000Z');

function createDataStore() {
  const values = new Map();
  const writes = [];
  return {
    values,
    writes,
    async get(key) {
      return values.get(key);
    },
    async set(key, value, ttl) {
      writes.push({ key, value, ttl });
      values.set(key, value);
    },
  };
}

function createService({ randomIds = ['attempt-1', 'transaction-1', 'jwt-1'] } = {}) {
  const dataStore = createDataStore();
  let idIndex = 0;
  return {
    dataStore,
    service: createPlayIntegrityAttemptService({
      dataStore,
      stateSecret,
      stateIssuer: 'ipification-demo',
      stateAudience: 'ipification-sdk',
      now: () => fixedNow,
      randomId: () => randomIds[idIndex++],
    }),
  };
}

async function createAttempt(service, overrides = {}) {
  return service.createAttempt({
    phoneNumber: '+84 901-234-567',
    clientId: 'demo',
    serverId: 'stage',
    resolveClient: (id) => ({ id, redirectUri: 'https://client.example/callback' }),
    resolveServer: (id) => ({ id, tokenEndpoint: 'https://server.example/token' }),
    ...overrides,
  });
}

async function approvedTransaction(service) {
  const attempt = await createAttempt(service);
  assert.ok(await service.claimAttempt(attempt.attemptId));
  const transaction = await service.approveAttempt(attempt.attemptId);
  assert.ok(transaction);
  return transaction;
}

test('creates an immutable E.164 attempt and returns only public data', async () => {
  const { service, dataStore } = createService();
  const client = { id: 'demo', redirectUri: 'https://client.example/callback' };
  const result = await createAttempt(service, { resolveClient: () => client });

  assert.match(result.attemptId, /^[\w-]+$/);
  assert.match(result.requestHash, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Object.hasOwn(result, 'phoneNumber'), false);
  assert.equal(Object.hasOwn(result, 'client'), false);
  assert.equal(dataStore.writes[0].key, 'play-integrity:attempt:attempt-1');
  assert.equal(dataStore.writes[0].ttl, 120_000);

  client.redirectUri = 'https://attacker.example/callback';
  const stored = await dataStore.get('play-integrity:attempt:attempt-1');
  assert.equal(stored.phoneNumber, '+84901234567');
  assert.equal(stored.client.redirectUri, 'https://client.example/callback');
  assert.equal(Object.isFrozen(stored), true);
  assert.equal(Object.isFrozen(stored.client), true);
});

test('binds the request hash to the immutable attempt snapshot', async () => {
  const { service } = createService({ randomIds: ['attempt-1', 'attempt-2'] });
  const first = await createAttempt(service, { phoneNumber: '+84901234567' });
  const second = await createAttempt(service, { phoneNumber: '+84901234568' });

  assert.notEqual(first.requestHash, second.requestHash);
});

test('rejects phone numbers that cannot be normalized to E.164', async () => {
  const { service } = createService();

  await assert.rejects(
    createAttempt(service, { phoneNumber: '0901234567' }),
    /E\.164/,
  );
});

test('requires both client and server resolvers', async () => {
  const { service } = createService();

  await assert.rejects(
    service.createAttempt({
      phoneNumber: '+84901234567', clientId: 'demo', serverId: 'stage', resolveServer: () => ({ id: 'stage' }),
    }),
    /client resolver/,
  );
  await assert.rejects(
    service.createAttempt({
      phoneNumber: '+84901234567', clientId: 'demo', serverId: 'stage', resolveClient: () => ({ id: 'demo' }),
    }),
    /server resolver/,
  );
});

test('rejects unresolved client or server IDs', async () => {
  const { service } = createService();

  await assert.rejects(
    createAttempt(service, { resolveClient: () => null }),
    /client not found/,
  );
  await assert.rejects(
    createAttempt(service, { resolveServer: () => null }),
    /server not found/,
  );
});

test('rejects resolved snapshots whose IDs do not match the requested IDs', async () => {
  const { service } = createService();

  await assert.rejects(
    createAttempt(service, { resolveClient: () => ({ id: 'other-client' }) }),
    /client id does not match/,
  );
  await assert.rejects(
    createAttempt(service, { resolveServer: () => ({ id: 'other-server' }) }),
    /server id does not match/,
  );
});

test('fails closed when resolver time exhausts the attempt TTL before persistence', async () => {
  const dataStore = createDataStore();
  let time = fixedNow.getTime();
  const service = createPlayIntegrityAttemptService({
    dataStore,
    stateSecret,
    stateIssuer: 'ipification-demo',
    stateAudience: 'ipification-sdk',
    now: () => time,
    randomId: () => 'attempt-1',
  });

  const result = await createAttempt(service, {
    resolveClient: async () => {
      time += 120_000;
      return { id: 'demo' };
    },
  });

  assert.equal(result, null);
  assert.equal(dataStore.writes.length, 0);
});

test('allows exactly one concurrent attempt claim', async () => {
  const { service } = createService();
  const { attemptId } = await createAttempt(service);

  const [first, second] = await Promise.all([
    service.claimAttempt(attemptId),
    service.claimAttempt(attemptId),
  ]);

  assert.equal([first, second].filter(Boolean).length, 1);
  assert.equal((await service.claimAttempt(attemptId)), null);
});

test('rejects only a claimed attempt and preserves the rejection reason', async () => {
  const { service, dataStore } = createService();
  const { attemptId } = await createAttempt(service);

  assert.equal(await service.rejectAttempt(attemptId, 'POLICY_REJECTED'), null);
  assert.ok(await service.claimAttempt(attemptId));
  const rejected = await service.rejectAttempt(attemptId, 'POLICY_REJECTED');

  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.reason, 'POLICY_REJECTED');
  assert.equal((await dataStore.get(`play-integrity:attempt:${attemptId}`)).status, 'rejected');
});

test('approves a claimed attempt by storing the transaction before finalizing the attempt', async () => {
  const { service, dataStore } = createService();
  const { attemptId } = await createAttempt(service);
  await service.claimAttempt(attemptId);

  const transaction = await service.approveAttempt(attemptId);
  const transactionWrite = dataStore.writes.findIndex(
    (write) => write.key === 'play-integrity:transaction:transaction-1',
  );
  const approvalWrite = dataStore.writes.findIndex(
    (write) => write.key === `play-integrity:attempt:${attemptId}` && write.value.status === 'approved',
  );

  assert.equal(transaction.status, 'approved');
  assert.equal(transaction.attempt.phoneNumber, '+84901234567');
  assert.equal(Object.isFrozen(transaction.attempt), true);
  assert.equal(dataStore.writes[transactionWrite].ttl, 120_000);
  assert.ok(transactionWrite < approvalWrite);
});

test('rejects a signed state after its transaction has been claimed once', async () => {
  const { service } = createService();
  const transaction = await approvedTransaction(service);
  const state = service.createSignedState(transaction);

  assert.equal((await service.claimTransaction(state)).status, 'claimed');
  assert.equal((await service.claimTransaction(state)).status, 'unavailable');
});

test('does not claim a state whose signed attempt or action does not match the transaction', async () => {
  const { service } = createService();
  const transaction = await approvedTransaction(service);
  const mismatchedState = jwt.sign(
    { typ: 'IPIFICATION_AUTH', tx: transaction.id, aid: 'other-attempt', act: transaction.attempt.action },
    stateSecret,
    {
      algorithm: 'HS512',
      expiresIn: '120s',
      issuer: 'ipification-demo',
      audience: 'ipification-sdk',
      jwtid: 'other-jwt',
    },
  );

  assert.equal((await service.claimTransaction(mismatchedState)).status, 'invalid');
  assert.equal(transaction.status, 'approved');
});

test('completes only an exchanging transaction as consumed or failed', async () => {
  const { service, dataStore } = createService();
  const transaction = await approvedTransaction(service);
  const state = service.createSignedState(transaction);

  assert.equal((await service.claimTransaction(state)).status, 'claimed');
  const consumed = await service.completeTransaction(transaction.id, 'consumed');
  assert.equal(consumed.status, 'consumed');
  assert.equal((await dataStore.get(`play-integrity:transaction:${transaction.id}`)).status, 'consumed');
  assert.equal(await service.completeTransaction(transaction.id, 'failed'), null);
});

test('does not claim state with a wrong issuer, audience, or signature', async () => {
  const { service } = createService();
  const transaction = await approvedTransaction(service);
  const state = service.createSignedState(transaction);
  const wrongAudience = jwt.sign(
    { typ: 'IPIFICATION_AUTH', tx: transaction.id, aid: transaction.attempt.id, act: transaction.attempt.action },
    stateSecret,
    { algorithm: 'HS512', expiresIn: '120s', issuer: 'ipification-demo', audience: 'other', jwtid: 'jwt-other' },
  );

  assert.equal((await service.claimTransaction(wrongAudience)).status, 'invalid');
  assert.equal((await service.claimTransaction(`${state}x`)).status, 'invalid');
  assert.equal((await service.claimTransaction(state)).status, 'claimed');
});
