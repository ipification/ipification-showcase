const authResultStore = require('../../services/authResultStore');
const { exchangeAuthorizationCode } = require('../../services/authService');
const logger = require('../../utils/logger');
const { findClientByClientId } = require('../../utils/helpers');
const { ERROR_MESSAGES, HTTP_STATUS } = require('../../utils/constants');

/**
 * Return raw userinfo stored by a callback for the body state.
 * Return empty 401 when no result exists; leave the cached result available.
 */
async function s2sSignin(req, res) {
  const { state } = req.body || {};
  logger.log(`body: ${JSON.stringify(req.body || {})}`);
  const userinfo = await authResultStore.getUserInfo(state);

  if (userinfo) {
    // Demo response; an integrating application can issue its own token here.
    res.send(userinfo);
  } else {
    res.status(HTTP_STATUS.UNAUTHORIZED).send();
  }
}

/**
 * Exchange body code using client_id, redirect_uri, and optional server_id.
 * Return auth_server merged with userinfo directly, without a browser session or cache write.
 * Invalid server returns 400; unknown client or exchange failure returns 401.
 */
async function mobileLogin(req, res) {
  const { client_id, code, redirect_uri, server_id: serverId } = req.body || {};
  logger.log(`body: ${JSON.stringify(req.body || {})}`);

  const { clients, getAuthServer, realm } = res.locals;

  // Get auth server (defaults to first server if serverId not provided)
  const authServer = getAuthServer(serverId);
  if (!authServer) {
    const error_message = serverId ? `Invalid server_id: '${serverId}'` : 'No auth servers configured';
    logger.error(error_message);
    res.status(HTTP_STATUS.BAD_REQUEST).send({ error: error_message });
    return;
  }

  const client = findClientByClientId(clients, client_id);
  if (!client) {
    logger.error(ERROR_MESSAGES.CLIENT_NOT_FOUND);
    res.status(HTTP_STATUS.UNAUTHORIZED).send({ error: ERROR_MESSAGES.CLIENT_NOT_FOUND });
    return;
  }

  try {
    const { userInfo } = await exchangeAuthorizationCode({
      server: authServer,
      realm,
      clientId: client_id,
      clientSecret: client.client_secret,
      redirectUri: redirect_uri,
      code,
    });
    logger.log(userInfo);

    const tokenResponse = {
      auth_server: authServer,
      ...userInfo,
    };

    res.send(tokenResponse);
  } catch (err) {
    logger.error('---> get token error:', err.message);
    res.status(HTTP_STATUS.UNAUTHORIZED).send({ error: err.message });
  }
}

module.exports = { s2sSignin, mobileLogin };
