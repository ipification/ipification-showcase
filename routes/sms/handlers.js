const prettyHtml = require('json-pretty-html').default;
const logger = require('../../utils/logger');
const { findClientByClientId } = require('../../utils/helpers');
const { ERROR_MESSAGES, HTTP_STATUS } = require('../../utils/constants');
const smsService = require('../../services/smsService');

/**
 * Start SMS authentication from body client_id and optional server/scope hints.
 * Return the request ID and nonce; preserve provider error status/data.
 */
async function auth(req, res) {
  const { client_id: clientId, scope: reqScope, server_id: serverId, login_hint: loginHint } = req.body;
  const { clients, getAuthServer, realm } = res.locals;

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
    const { authReqId, nonce } = await smsService.startAuthentication({
      authServerUrl, realm, clientId, clientSecret, reqScope, scope, loginHint,
    });

    res.json({
      auth_server: authServer,
      auth_req_id: authReqId,
      nonce,
    });
  } catch (error) {
    logger.error('SMS auth error:', error.message);

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
  const { data } = req.body;
  logger.log('--> sms log');
  logger.log(JSON.stringify(data));
  res.send('OK');
}

function buildSessionUserData(userInfo, client, nonce) {
  return {
    userInfo: prettyHtml(userInfo),
    client_id: client.client_id,
    client_title: client.title || 'SMS',
    state: nonce,
  };
}

/**
 * Complete the SMS callback and CIBA exchange using body auth_req_id and code.
 * Return userinfo and store display data in the browser session.
 * Preserve the demo's session update on token failure, with formatted error data.
 */
async function token(req, res) {
  logger.log('--> sms token');
  logger.log(JSON.stringify(req.body));
  const { auth_req_id: authReqId, code: smsCode, client_id: clientId, nonce, server_id: serverId } = req.body;
  const { clients, getAuthServer, realm } = res.locals;

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
    const userInfo = await smsService.exchangeToken({
      authServerUrl, realm, clientId, clientSecret, authReqId, smsCode,
    });

    req.session.isAuthenticated = true;
    req.session.userData = buildSessionUserData(userInfo, client, nonce);

    res.json({
      auth_server: authServer,
      ...userInfo,
    });
  } catch (error) {
    logger.error('SMS token error:', error.message);

    const errorResponse = {
      error: error.message,
      status: error.response?.status || HTTP_STATUS.INTERNAL_SERVER_ERROR
    };

    if (error.response?.data) {
      errorResponse.data = error.response.data;
    }

    logger.error('SMS token errorResponse:', errorResponse);

    req.session.isAuthenticated = true;
    req.session.userData = buildSessionUserData(errorResponse, client, nonce);

    res.status(error.response?.status || HTTP_STATUS.INTERNAL_SERVER_ERROR).json(errorResponse);
  }
}

module.exports = { auth, log, token };
