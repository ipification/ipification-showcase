const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { PlayIntegrityUnavailableError } = require('../services/playIntegrityService');
const logger = require('../utils/logger');

function createPlayIntegrityRouter({
  attemptService,
  verify,
  exchangeCodeAndGetUserInfo,
  expectedPackageName,
  userFlow,
  bypassVerification = false,
  maxAgeMs = 120_000,
  requestIdFactory = uuidv4,
  logCompletion = defaultLogCompletion,
  logVerificationFailure = defaultLogVerificationFailure,
}) {
  if (!attemptService || typeof attemptService.completeTransaction !== 'function'
    || typeof verify !== 'function' || typeof exchangeCodeAndGetUserInfo !== 'function') {
    throw new TypeError('attempt, verification, and exchange services are required');
  }
  if (!isNonEmptyString(userFlow)) {
    throw new TypeError('a Play Integrity user flow is required');
  }

  const router = express.Router();
  router.use(express.json({ limit: '16kb' }));

  router.post('/attempt', async (req, res) => {
    const completion = createCompletion('attempt', requestIdFactory);
    const {
      phone_number: phoneNumber,
      server_id: serverId,
    } = req.body || {};
    if (!isNonEmptyString(phoneNumber) || !isNonEmptyString(serverId)) {
      respond(res, 400, safeResponse(completion.requestId, 'deny', ['INVALID_REQUEST']), completion, logCompletion);
      return;
    }

    try {
      const resolveClient = createClientResolver(res.locals, serverId, userFlow);
      const client = resolveClient();
      if (!client || !isNonEmptyString(client.client_id)) {
        throw new TypeError('configured Play Integrity client is unavailable');
      }
      const result = await attemptService.createAttempt({
        phoneNumber,
        clientId: client.client_id,
        serverId,
        resolveClient,
        resolveServer: createServerResolver(res.locals),
      });
      if (!result) {
        respond(res, 409, safeResponse(completion.requestId, 'deny', ['ATTEMPT_UNAVAILABLE']), completion, logCompletion);
        return;
      }
      respond(res, 201, publicAttemptResponse(result), completion, logCompletion, 'allow');
    } catch {
      respond(res, 400, safeResponse(completion.requestId, 'deny', ['INVALID_REQUEST']), completion, logCompletion);
    }
  });

  router.post('/verify', async (req, res) => {
    const completion = createCompletion('verify', requestIdFactory);
    const {
      attempt_id: attemptId,
      integrity_token: integrityToken,
    } = req.body || {};
    if (!isNonEmptyString(attemptId) || !isNonEmptyString(integrityToken)) {
      respond(res, 400, safeResponse(completion.requestId, 'deny', ['INVALID_REQUEST']), completion, logCompletion);
      return;
    }

    const attempt = await attemptService.claimAttempt(attemptId);
    if (!attempt) {
      respond(res, 409, safeResponse(completion.requestId, 'deny', ['ATTEMPT_UNAVAILABLE']), completion, logCompletion);
      return;
    }

    try {
      const verdict = bypassVerification
        ? { decision: 'allow', reasonCodes: [] }
        : await verify({ integrityToken, expectedRequestHash: attempt.requestHash, expectedPackageName, maxAgeMs });
      const reasonCodes = safeReasonCodes(verdict?.reasonCodes);
      if (verdict?.decision !== 'allow') {
        await attemptService.rejectAttempt(attempt.id, reasonCodes[0] || 'POLICY_DENIED');
        respond(res, 403, safeResponse(completion.requestId, 'deny', reasonCodes), completion, logCompletion);
        return;
      }

      const transaction = await attemptService.approveAttempt(attempt.id);
      if (!transaction) {
        respond(res, 409, safeResponse(completion.requestId, 'deny', ['ATTEMPT_UNAVAILABLE']), completion, logCompletion);
        return;
      }
      const state = attemptService.createSignedState(transaction);
      respond(res, 201, { state, expires_at: transaction.expiresAt }, completion, logCompletion, 'allow');
    } catch (error) {
      if (error instanceof PlayIntegrityUnavailableError) {
        logVerificationFailureSafely(logVerificationFailure, completion.requestId, error.reasonCode, error, integrityToken);
        await rejectAttemptSafely(attemptService, attempt.id, error.reasonCode);
        respond(res, 503, safeResponse(completion.requestId, 'unavailable', [error.reasonCode]), completion, logCompletion);
        return;
      }
      logVerificationFailureSafely(logVerificationFailure, completion.requestId, 'GOOGLE_VERIFICATION_FAILED', error, integrityToken);
      await rejectAttemptSafely(attemptService, attempt.id, 'GOOGLE_VERIFICATION_FAILED');
      respond(res, 503, safeResponse(completion.requestId, 'unavailable', ['GOOGLE_VERIFICATION_FAILED']), completion, logCompletion);
    }
  });

  router.post('/token-exchange', async (req, res) => {
    const completion = createCompletion('token-exchange', requestIdFactory);
    const { code, state } = req.body || {};
    if (!isNonEmptyString(code) || !isWellFormedState(state)) {
      respond(res, 400, safeResponse(completion.requestId, 'deny', ['INVALID_REQUEST']), completion, logCompletion);
      return;
    }

    const claim = await attemptService.claimTransaction(state);
    if (claim?.status === 'invalid') {
      respond(res, 400, safeResponse(completion.requestId, 'deny', ['INVALID_STATE']), completion, logCompletion);
      return;
    }
    if (claim?.status !== 'claimed') {
      respond(res, 409, safeResponse(completion.requestId, 'deny', ['TRANSACTION_UNAVAILABLE']), completion, logCompletion);
      return;
    }
    const transaction = claim.transaction;

    try {
      const { tokenUrl, userUrl, params } = exchangeInputs(transaction.attempt, code);
      await exchangeCodeAndGetUserInfo(tokenUrl, userUrl, params);
      await completeTransactionSafely(attemptService, transaction.id, 'consumed');
      respond(res, 200, { decision: 'allow' }, completion, logCompletion, 'allow');
    } catch {
      await completeTransactionSafely(attemptService, transaction.id, 'failed');
      respond(res, 401, safeResponse(completion.requestId, 'deny', ['IPIFICATION_EXCHANGE_FAILED']), completion, logCompletion);
    }
  });

  router.use((error, req, res, next) => {
    if (error?.type === 'entity.parse.failed' || error?.type === 'entity.too.large') {
      const completion = createCompletion(requestEndpoint(req), requestIdFactory);
      respond(res, 400, safeResponse(completion.requestId, 'deny', ['INVALID_REQUEST']), completion, logCompletion);
      return;
    }
    next(error);
  });

  return router;
}

function createClientResolver(locals, serverId, userFlow) {
  return () => {
    const client = Array.isArray(locals.clients)
      ? locals.clients.find((candidate) => candidate?.user_flow === userFlow)
      : null;
    if (!client) return null;
    const redirectUri = client.redirect_uri || `${locals.baseUrl}/auth/callback/${client.user_flow}/${serverId}`;
    return { ...client, id: client.client_id, redirectUri };
  };
}

function createServerResolver(locals) {
  return (serverId) => {
    const server = typeof locals.getAuthServer === 'function' ? locals.getAuthServer(serverId) : null;
    if (!server) return null;
    return { ...server, id: serverId, realm: locals.realm };
  };
}

function exchangeInputs(attempt, code) {
  const client = attempt?.client;
  const server = attempt?.server;
  if (!isNonEmptyString(client?.client_id) || !isNonEmptyString(client?.client_secret)
    || !isNonEmptyString(client?.redirectUri) || !isNonEmptyString(server?.url)
    || !isNonEmptyString(server?.realm)) {
    throw new TypeError('frozen attempt snapshot is incomplete');
  }
  const root = server.url.replace(/\/$/, '');
  const protocolRoot = `${root}/realms/${encodeURIComponent(server.realm)}/protocol/openid-connect`;
  return {
    tokenUrl: `${protocolRoot}/token`,
    userUrl: `${protocolRoot}/userinfo`,
    params: {
      code,
      redirect_uri: client.redirectUri,
      grant_type: 'authorization_code',
      client_id: client.client_id,
      client_secret: client.client_secret,
    },
  };
}

function publicAttemptResponse(result) {
  return {
    attempt_id: result.attemptId,
    request_hash: result.requestHash,
    expires_at: result.expiresAt,
  };
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isWellFormedState(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}

function safeReasonCodes(reasonCodes) {
  const safe = Array.isArray(reasonCodes)
    ? reasonCodes.filter((reason) => typeof reason === 'string' && /^[A-Z0-9_]{1,80}$/.test(reason))
    : [];
  return safe.length > 0 ? safe : ['POLICY_DENIED'];
}

function safeResponse(requestId, decision, reasonCodes) {
  return { request_id: requestId, decision, reason_codes: safeReasonCodes(reasonCodes) };
}

function createCompletion(endpoint, requestIdFactory) {
  return { endpoint, requestId: requestIdFactory(), startedAt: Date.now() };
}

function requestEndpoint(req) {
  return req.path?.replace(/^\//, '') || 'unknown';
}

function respond(res, status, body, completion, logCompletion, decision = body.decision, reasonCodes = body.reason_codes || []) {
  logCompletionSafely(logCompletion, {
    requestId: completion.requestId,
    endpoint: completion.endpoint,
    decision,
    reasonCodes: decision === 'allow' ? [] : safeReasonCodes(reasonCodes),
    duration: Date.now() - completion.startedAt,
  });
  res.status(status).json(body);
}

async function rejectAttemptSafely(attemptService, attemptId, reason) {
  try {
    await attemptService.rejectAttempt(attemptId, reason);
  } catch {
    // Dependency response takes priority over best-effort state bookkeeping.
  }
}

async function completeTransactionSafely(attemptService, transactionId, status) {
  try {
    await attemptService.completeTransaction(transactionId, status);
  } catch {
    // The transaction was already claimed, so completion bookkeeping cannot permit replay.
  }
}

function logCompletionSafely(logCompletion, event) {
  try {
    logCompletion(event);
  } catch {
    // Completion logging must not change the endpoint response.
  }
}

function defaultLogVerificationFailure(event) {
  logger.error('Play Integrity verification failed', event);
}

function logVerificationFailureSafely(logVerificationFailure, requestId, reasonCode, error, integrityToken) {
  try {
    const cause = error?.cause instanceof Error ? error.cause : error;
    logVerificationFailure({
      request_id: requestId,
      reason_code: reasonCode,
      error_name: safeErrorName(cause),
      error_message: safeErrorMessage(cause, integrityToken),
    });
  } catch {
    // Diagnostic logging must not change the endpoint response.
  }
}

function safeErrorName(error) {
  return typeof error?.name === 'string' && error.name.length > 0 ? error.name.slice(0, 80) : 'Error';
}

function safeErrorMessage(error, integrityToken) {
  if (typeof error?.message !== 'string' || error.message.length === 0) return 'unknown error';
  return error.message.slice(0, 500).replaceAll(integrityToken, '[REDACTED]');
}

function defaultLogCompletion(event) {
  console.info(JSON.stringify(event));
}

module.exports = { createPlayIntegrityRouter, exchangeInputs };
