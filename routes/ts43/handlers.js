const prettyHtml = require('json-pretty-html').default;
const logger = require('../../utils/logger');
const { findClientByClientId } = require('../../utils/helpers');
const { ERROR_MESSAGES, HTTP_STATUS } = require('../../utils/constants');
const ts43Service = require('../../services/ts43Service');

/**
 * Start TS43 authentication from body client_id and optional server/scope hints.
 * Return the request ID and nonce, plus the digital credential request; preserve provider error status/data.
 */
async function auth(req, res) {
  const { login_hint, carrier_hint, client_id: clientId, operation, scope: reqScope, server_id: serverId } = req.body;
  const { clients, getAuthServer, realm } = res.locals;

  // Get auth server (defaults to first server if serverId not provided)
  const authServer = getAuthServer(serverId);
  if (!authServer) {
    res.status(HTTP_STATUS.BAD_REQUEST).send({ error: serverId ? `Invalid server_id: '${serverId}'` : 'No auth servers configured' });
    return;
  }

  const { url: authServerUrl } = authServer;

  const client = findClientByClientId(clients, clientId);

  if (!client) {
    logger.log(`client(${clientId}) not found`);
    res.status(HTTP_STATUS.UNAUTHORIZED).send(ERROR_MESSAGES.CLIENT_NOT_FOUND);
    return;
  }

  const { client_secret: clientSecret, scope } = client;

  try {
    const { authReqId, nonce, digitalRequest } = await ts43Service.startAuthentication({
      authServerUrl, realm, clientId, clientSecret, reqScope, scope,
      loginHint: login_hint, carrierHint: carrier_hint, operation,
    });

    res.json({
      auth_server: authServer,
      auth_req_id: authReqId,
      nonce,
      digital_request: digitalRequest,
    });
  } catch (error) {
    logger.error('CIBA Auth Error:', error.message);

    const errorResponse = {
      auth_server: authServer,
      success: false,
      error: error.message,
      status: error.response?.status || HTTP_STATUS.INTERNAL_SERVER_ERROR
    };

    if (error.response?.data) {
      errorResponse.data = error.response.data;
    }

    res.status(error.response?.status || HTTP_STATUS.INTERNAL_SERVER_ERROR).json(errorResponse);
  }
}

/** Record client diagnostics from body data and acknowledge with plain-text OK. */
async function log(req, res) {
  const { data: data } = req.body;
  logger.log('--> log');
  logger.log(JSON.stringify(data));
  res.send('OK');
}

function buildSessionUserData(userInfo, clientId, nonce) {
  return {
    userInfo: prettyHtml(userInfo),
    client_id: clientId,
    client_title: 'SIM',
    state: nonce,
  };
}

/**
 * Complete the TS43 callback and CIBA exchange using body auth_req_id and vp_token.
 * Return userinfo and store display data in the browser session.
 * Preserve the demo's session update on token failure, with formatted error data.
 */
async function token(req, res) {
  logger.log('--> token');
  logger.log(JSON.stringify(req.body));
  const { vp_token: vpToken, auth_req_id: authReqId, client_id: clientId, nonce, server_id: serverId } = req.body;
  const { clients, getAuthServer, realm } = res.locals;

  // Get auth server (defaults to first server if serverId not provided)
  const authServer = getAuthServer(serverId);
  if (!authServer) {
    res.status(HTTP_STATUS.BAD_REQUEST).send({ error: serverId ? `Invalid server_id: '${serverId}'` : 'No auth servers configured' });
    return;
  }

  const { url: authServerUrl } = authServer;

  const client = findClientByClientId(clients, clientId);

  if (!client) {
    res.status(HTTP_STATUS.UNAUTHORIZED).send({ error: ERROR_MESSAGES.CLIENT_NOT_FOUND });
    return;
  }

  const { client_secret: clientSecret } = client;

  try {
    const userInfo = await ts43Service.exchangeToken({
      authServerUrl, realm, clientId, clientSecret, authReqId, vpToken,
    });

    req.session.isAuthenticated = true;
    req.session.userData = buildSessionUserData(userInfo, clientId, nonce);

    const tokenResponse = {
      auth_server: authServer,
      ...userInfo,
    };

    res.json(tokenResponse);
  } catch (error) {
    logger.error('Token Auth Error:', error.message);

    const errorResponse = {
      error: error.message,
      status: error.response?.status || HTTP_STATUS.INTERNAL_SERVER_ERROR
    };

    if (error.response?.data) {
      errorResponse.data = error.response.data;
    }

    logger.error('Token Auth errorResponse:', errorResponse);

    req.session.isAuthenticated = true;
    req.session.userData = buildSessionUserData(errorResponse, clientId, nonce);

    res.status(error.response?.status || HTTP_STATUS.INTERNAL_SERVER_ERROR).json(errorResponse);
  }
}

module.exports = { auth, log, token };
