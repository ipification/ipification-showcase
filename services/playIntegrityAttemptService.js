const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { createRequestHash } = require('../utils/canonicalJson');
const { normalizePhoneNumber } = require('../utils/phoneNumber');

const ATTEMPT_TTL_MS = 120_000;
const ACTION = 'IPIFICATION_AUTH';

function createPlayIntegrityAttemptService({
  dataStore,
  stateSecret,
  stateIssuer,
  stateAudience,
  now = () => new Date(),
  randomId = crypto.randomUUID,
}) {
  if (!dataStore || typeof dataStore.get !== 'function' || typeof dataStore.set !== 'function') {
    throw new TypeError('dataStore must provide get and set methods');
  }
  if (typeof stateSecret !== 'string' || stateSecret.length === 0) {
    throw new TypeError('stateSecret is required');
  }
  if (typeof stateIssuer !== 'string' || stateIssuer.length === 0) {
    throw new TypeError('stateIssuer is required');
  }
  if (typeof stateAudience !== 'string' || stateAudience.length === 0) {
    throw new TypeError('stateAudience is required');
  }
  if (typeof randomId !== 'function') throw new TypeError('randomId must be a function');

  const locks = new Map();

  function currentTimeMs() {
    const value = now();
    const milliseconds = value instanceof Date ? value.getTime() : Number(value);
    if (!Number.isFinite(milliseconds)) throw new TypeError('now must return a valid time');
    return milliseconds;
  }

  function attemptKey(attemptId) {
    return `play-integrity:attempt:${attemptId}`;
  }

  function transactionKey(transactionId) {
    return `play-integrity:transaction:${transactionId}`;
  }

  function withKeyLock(key, operation) {
    const previous = locks.get(key) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    const queueTail = previous.then(() => current);
    locks.set(key, queueTail);

    return previous.then(operation).finally(() => {
      release();
      if (locks.get(key) === queueTail) locks.delete(key);
    });
  }

  async function save(key, value) {
    const ttl = Date.parse(value.expiresAt) - currentTimeMs();
    if (ttl <= 0) return false;
    await dataStore.set(key, freezeSnapshot(value), ttl);
    return true;
  }

  async function resolveSnapshot(resolver, id, kind) {
    if (typeof resolver !== 'function') throw new TypeError(`${kind} resolver must be a function`);
    const resolved = await resolver(id);
    if (!resolved) throw new Error(`${kind} not found`);
    if (resolved.id !== id) throw new Error(`${kind} id does not match requested id`);
    return freezeSnapshot(resolved);
  }

  async function createAttempt({ phoneNumber, clientId, serverId, resolveClient, resolveServer }) {
    if (typeof clientId !== 'string' || clientId.length === 0) throw new TypeError('clientId is required');
    if (typeof serverId !== 'string' || serverId.length === 0) throw new TypeError('serverId is required');

    const phoneNumberE164 = normalizePhoneNumber(phoneNumber);
    const createdAtMs = currentTimeMs();
    const [client, server] = await Promise.all([
      resolveSnapshot(resolveClient, clientId, 'client'),
      resolveSnapshot(resolveServer, serverId, 'server'),
    ]);
    const id = randomId();
    if (typeof id !== 'string' || !/^[\w-]+$/.test(id)) {
      throw new TypeError('randomId must return a URL-safe identifier');
    }
    const expiresAt = new Date(createdAtMs + ATTEMPT_TTL_MS).toISOString();
    const phoneNumberHash = crypto.createHash('sha256').update(phoneNumberE164, 'utf8').digest('base64url');
    const requestHash = createRequestHash(ACTION, {
      attemptId: id,
      clientId,
      serverId,
      phoneNumberHash,
    });
    const attempt = freezeSnapshot({
      id,
      action: ACTION,
      phoneNumber: phoneNumberE164,
      phoneNumberHash,
      clientId,
      serverId,
      client,
      server,
      requestHash,
      status: 'created',
      createdAt: new Date(createdAtMs).toISOString(),
      expiresAt,
    });

    if (!await save(attemptKey(id), attempt)) return null;
    return freezeSnapshot({ attemptId: id, requestHash, expiresAt });
  }

  async function claimAttempt(attemptId) {
    const key = attemptKey(attemptId);
    return withKeyLock(key, async () => {
      const attempt = await dataStore.get(key);
      if (!attempt || attempt.status !== 'created' || isExpired(attempt, currentTimeMs())) return null;

      const claimed = freezeSnapshot({ ...attempt, status: 'verifying' });
      return await save(key, claimed) ? claimed : null;
    });
  }

  async function rejectAttempt(attemptId, reason = 'REJECTED') {
    const key = attemptKey(attemptId);
    return withKeyLock(key, async () => {
      const attempt = await dataStore.get(key);
      if (!attempt || attempt.status !== 'verifying' || isExpired(attempt, currentTimeMs())) return null;

      const rejected = freezeSnapshot({ ...attempt, status: 'rejected', reason: String(reason) });
      return await save(key, rejected) ? rejected : null;
    });
  }

  async function approveAttempt(attemptId) {
    const key = attemptKey(attemptId);
    return withKeyLock(key, async () => {
      const attempt = await dataStore.get(key);
      if (!attempt || attempt.status !== 'verifying' || isExpired(attempt, currentTimeMs())) return null;

      const transactionId = randomId();
      if (typeof transactionId !== 'string' || !/^[\w-]+$/.test(transactionId)) {
        throw new TypeError('randomId must return a URL-safe identifier');
      }
      const transaction = freezeSnapshot({
        id: transactionId,
        attemptId: attempt.id,
        attempt: freezeSnapshot(attempt),
        status: 'approved',
        createdAt: new Date(currentTimeMs()).toISOString(),
        expiresAt: attempt.expiresAt,
      });
      if (!await save(transactionKey(transactionId), transaction)) return null;

      const approvedAttempt = freezeSnapshot({ ...attempt, status: 'approved' });
      if (!await save(key, approvedAttempt)) return null;
      return transaction;
    });
  }

  function createSignedState(transaction) {
    if (!transaction || transaction.status !== 'approved' || !transaction.attempt) {
      throw new TypeError('transaction must be approved');
    }
    return jwt.sign(
      {
        typ: ACTION,
        tx: transaction.id,
        aid: transaction.attempt.id,
        act: transaction.attempt.action,
      },
      stateSecret,
      {
        algorithm: 'HS512',
        expiresIn: '120s',
        issuer: stateIssuer,
        audience: stateAudience,
        jwtid: randomId(),
      },
    );
  }

  async function claimTransaction(state) {
    let claims;
    try {
      claims = jwt.verify(state, stateSecret, {
        algorithms: ['HS512'],
        issuer: stateIssuer,
        audience: stateAudience,
      });
    } catch {
      return { status: 'invalid' };
    }
    if (!isValidStateClaims(claims)) return { status: 'invalid' };

    const key = transactionKey(claims.tx);
    return withKeyLock(key, async () => {
      const transaction = await dataStore.get(key);
      if (!transaction || transaction.status !== 'approved' || isExpired(transaction, currentTimeMs())) {
        return { status: 'unavailable' };
      }
      if (transaction.id !== claims.tx
        || transaction.attemptId !== claims.aid
        || transaction.attempt?.id !== claims.aid
        || transaction.attempt?.action !== claims.act) {
        return { status: 'invalid' };
      }

      const exchanging = freezeSnapshot({ ...transaction, status: 'exchanging' });
      return await save(key, exchanging)
        ? { status: 'claimed', transaction: exchanging }
        : { status: 'unavailable' };
    });
  }

  async function completeTransaction(transactionId, status) {
    if (!['consumed', 'failed'].includes(status)) throw new TypeError('transaction status is invalid');
    const key = transactionKey(transactionId);
    return withKeyLock(key, async () => {
      const transaction = await dataStore.get(key);
      if (!transaction || transaction.status !== 'exchanging' || isExpired(transaction, currentTimeMs())) {
        return null;
      }
      const completed = freezeSnapshot({ ...transaction, status });
      return await save(key, completed) ? completed : null;
    });
  }

  return {
    createAttempt,
    claimAttempt,
    rejectAttempt,
    approveAttempt,
    createSignedState,
    claimTransaction,
    completeTransaction,
  };
}

function isExpired(value, nowMs) {
  return !value.expiresAt || Date.parse(value.expiresAt) <= nowMs;
}

function isValidStateClaims(claims) {
  return claims
    && claims.typ === ACTION
    && typeof claims.tx === 'string'
    && typeof claims.aid === 'string'
    && typeof claims.act === 'string';
}

function freezeSnapshot(value) {
  const clone = structuredClone(value);
  return deepFreeze(clone);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

module.exports = { createPlayIntegrityAttemptService };
