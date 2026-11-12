const { v4: uuidv4 } = require('uuid');
const htmlEntities = require('html-entities');
const prettyHtml = require('json-pretty-html').default;
const authResultStore = require('../../services/authResultStore');
const { buildAuthorizationUrl, exchangeAuthorizationCode } = require('../../services/authService');
const logger = require('../../utils/logger');
const { findClientByUserFlow } = require('../../utils/helpers');
const { QR_CODE_SUFFIX, ERROR_MESSAGES, HTTP_STATUS } = require('../../utils/constants');

const CALLBACK_ERROR_MESSAGES = Object.freeze({
  access_denied: 'Authentication was cancelled.',
  login_required: 'Authentication is required to continue.',
  operator_not_resolved: 'Your mobile operator could not be resolved.',
  server_error: 'Authentication is temporarily unavailable.',
  temporarily_unavailable: 'Authentication is temporarily unavailable.',
});

/**
 * Render the login page and display the pending session error once.
 * Clear the error from the session before rendering.
 */
function login(req, res) {
  const error_message = req.session.error_message;

  req.session.error_message = null;
  res.render('login', {
    error_message: htmlEntities.encode(error_message),
    node_env: process.env.NODE_ENV
  });
}

/**
 * Redirect to the provider for query user_flow and state, with optional phone/server_id.
 * Default to the first configured server; return to login when state is absent.
 */
function start(req, res) {
  const { clients, getAuthServer, realm, baseUrl } = res.locals;
  const { user_flow: userFlow, phone, state, server_id: serverId } = req.query || {};

  // Get auth server (defaults to first server if serverId not provided)
  const authServer = getAuthServer(serverId);
  if (!authServer) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: serverId ? 'INVALID_SERVER_ID' : 'NO_AUTH_SERVERS_CONFIGURED',
    });
    return;
  }

  const client = findClientByUserFlow(clients, userFlow);
  if (!client) {
    res.send(ERROR_MESSAGES.CLIENT_NOT_FOUND);
    return;
  }

  if (!state || state === '') {
    res.redirect('/auth/login');
    return;
  }

  const authUrl = buildAuthorizationUrl({ client, baseUrl, userFlow, server: authServer, realm, state, phone });

  logger.log('authUrl:', authUrl);
  res.redirect(authUrl);
}

function isQrCodeState(state) {
  return state.indexOf(QR_CODE_SUFFIX) >= 0;
}

function handleQrCodeCallback(req, res, state, authCompleteUrl, userInfo) {
  const channel = `auth:${state}`;
  req.app.get('socket').to(channel).emit('messages', {
    event_name: 'url',
    url: authCompleteUrl
  });

  if (userInfo.phone_number_verified === 'false') {
    res.redirect('/auth/qrcode/error');
  } else {
    res.redirect('/auth/qrcode/complete');
  }
}

/**
 * Exchange the provider code for userinfo using the path's userFlow/serverId.
 * Store display data and raw userinfo before selecting the response:
 * backchannel returns empty 200; QR notifies the desktop and redirects the phone;
 * ordinary web authentication redirects to session completion.
 * Provider-reported errors return to login with a fixed session error message.
 */
async function callback(req, res) {
  const { userFlow, serverId } = req.params || {};
  const { state = uuidv4(), code } = req.query || {};
  const { clients, getAuthServer, realm, baseUrl } = res.locals;
  const ipBackchannelAuth = req.headers['ip-backchannel-im-auth'] === 'true';

  if (req.query.error || req.query.error_description) {
    req.session.error_message = CALLBACK_ERROR_MESSAGES[req.query.error] || 'Unable to complete authentication.';
    res.redirect(`/auth/login`);
    return;
  }

  // Get auth server (defaults to first server if serverId not provided)
  const authServer = getAuthServer(serverId);
  if (!authServer) {
    res.status(HTTP_STATUS.BAD_REQUEST).send(serverId ? `Invalid server_id: '${serverId}'` : 'No auth servers configured');
    return;
  }

  const client = findClientByUserFlow(clients, userFlow);
  if (!client) {
    res.send(ERROR_MESSAGES.CLIENT_NOT_FOUND);
    return;
  }

  const { client_id: clientId, client_secret: clientSecret, title: pageTitle } = client;

  const redirectUri = `${baseUrl}/auth/callback/${userFlow}/${authServer.id}`;

  let userInfo;
  try {
    ({ userInfo } = await exchangeAuthorizationCode({
      server: authServer, realm, clientId, clientSecret, redirectUri, code,
    }));
  } catch (err) {
    logger.error('---> get token error:', err.message);
    if (err.response?.data) {
      logger.error('Error response data:', err.response.data);
    }
    const providerError = err.response?.data;
    req.session.error_message = [providerError?.error_description, providerError?.error]
      .find(value => typeof value === 'string' && value.trim()) || 'Unable to complete authentication.';
    res.redirect('/auth/login');
    return;
  }

  try {
    logger.log(`state: ${state}`);
    logger.log(`userInfo: ${JSON.stringify(userInfo)}`);

    const response = {
      userInfo: prettyHtml(userInfo),
      client_id: clientId,
      client_title: pageTitle,
      state
    };

    await authResultStore.saveResult(state, response, userInfo);
    const auth_complete_url = `${baseUrl}/auth/complete?state=${state}`;

    // Backchannel responses take precedence even when state contains the QR marker.
    if (ipBackchannelAuth) {
      logger.log('ipBackchannelAuth: true -> render 200');
      res.send();
      return;
    }

    // The provider code is already exchanged and both results are stored.
    // Notify the desktop to finish its session through /auth/complete.
    if (isQrCodeState(state)) {
      handleQrCodeCallback(req, res, state, auth_complete_url, userInfo);
      return;
    }

    res.redirect(auth_complete_url);
  } catch (err) {
    logger.error('---> get token error:', err.message);
    req.session.error_message = err.message;
    res.redirect('/auth/login');
  }
}

/**
 * Wait for the callback result identified by query state, then adopt it into the session.
 * Redirect to /user/info on success, or / when polling finds no result.
 */
async function complete(req, res) {
  const { state } = req.query || {};

  const response = await authResultStore.waitForResult(state);

  if (response) {
    // The desktop or mobile browser adopts the stored display result.
    req.session.isAuthenticated = true;
    req.session.userData = response;
    res.redirect('/user/info');
    return;
  }
  res.redirect('/');
}

/**
 * Render QR success on the phone; the desktop completes its session separately.
 */
async function qrComplete(req, res) {
  res.render('qr_success');
}

/**
 * Render the phone's QR error page when verification returns the string 'false'.
 */
async function qrError(req, res) {
  res.render('qr_error');
}

module.exports = { login, start, callback, complete, qrComplete, qrError };
