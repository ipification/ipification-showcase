const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const htmlEntities = require('html-entities');
const qs = require('qs');
const debug = require('debug')('info');
const prettyHtml = require('json-pretty-html').default;
const dataStore = require('../lib/data_store');
const logger = require('../utils/logger');
const { findClientByUserFlow, findClientByClientId, delay } = require('../utils/helpers');
const { QR_CODE_SUFFIX, ERROR_MESSAGES, HTTP_STATUS, MAX_RETRY_ATTEMPTS, RETRY_DELAY_MS } = require('../utils/constants');
const { exchangeCodeAndGetUserInfo } = require('../utils/httpClient');

const CALLBACK_ERROR_MESSAGES = Object.freeze({
  access_denied: 'Authentication was cancelled.',
  login_required: 'Authentication is required to continue.',
  operator_not_resolved: 'Your mobile operator could not be resolved.',
  server_error: 'Authentication is temporarily unavailable.',
  temporarily_unavailable: 'Authentication is temporarily unavailable.',
});

router.get('/login', function (req, res) {
  const error_message = req.session.error_message;

  req.session.error_message = null;
  res.render('login', {
    error_message: htmlEntities.encode(error_message),
    node_env: process.env.NODE_ENV
  });
});

function buildAuthParams(client, baseUrl, userFlow, serverId, state, phone) {
  const { client_id: clientId, scope, channel } = client;
  const redirectUrl = `${baseUrl}/auth/callback/${userFlow}/${serverId}`;
  const params = {
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUrl,
    scope: scope,
    state: state,
    nonce: uuidv4(),
    ui_locales: 'en',
    consent_id: process.env.CONSENT_ID,
    consent_timestamp: Math.floor(Date.now() / 1000),
    env: process.env.NODE_ENV || 'development'
  };

  if (channel) params.channel = channel;
  if (phone) params.login_hint = phone;

  return params;
}

function buildAuthUrl(userFlow, authServerUrl, realm, params) {
  if (userFlow === 'pvn_ipificator') {
    return `https://ipificator.ipification.com/api?` + qs.stringify(params);
  }
  return `${authServerUrl}/realms/${realm}/protocol/openid-connect/auth?` + qs.stringify(params);
}

router.get('/start', function (req, res) {
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

  const { id: actualServerId, url: authServerUrl } = authServer;

  const client = findClientByUserFlow(clients, userFlow);
  if (!client) {
    res.send(ERROR_MESSAGES.CLIENT_NOT_FOUND);
    return;
  }

  if (!state || state === '') {
    res.redirect('/auth/login');
    return;
  }

  const params = buildAuthParams(client, baseUrl, userFlow, actualServerId, state, phone);
  const authUrl = buildAuthUrl(userFlow, authServerUrl, realm, params);

  logger.log('authUrl:', authUrl);
  res.redirect(authUrl);
});

/*

  desktop flow
  1. user access home page
  2. generate qrcode "***-qrcode" -> show qrcode

  3. user scan qr code from mobile
    - user complete auth process

  4. server side receive callback request
    5.1 check if state content "-qrcode"
      - socket notify to desktop browser -> show qr code page success

  5. desktop browser receive socket event
  6. redirect to event url with set qrcode = 0
  7. start callback with code -> exchange to token and get user information
  8. show user info page

  mobile web flow
  1. user access home page
  2. user click IM button

  3. user complete IM process

  4. server side receive callback request
  5. show user info page

*/

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

router.get('/callback/:userFlow/:serverId', async function (req, res) {
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

  const { id: actualServerId, url: authServerUrl } = authServer;

  const client = findClientByUserFlow(clients, userFlow);
  if (!client) {
    res.send(ERROR_MESSAGES.CLIENT_NOT_FOUND);
    return;
  }

  const { client_id: clientId, client_secret: clientSecret, title: pageTitle } = client;

  const redirectUri = `${baseUrl}/auth/callback/${userFlow}/${actualServerId}`;
  const tokenUrl = `${authServerUrl}/realms/${realm}/protocol/openid-connect/token`;
  const userUrl = `${authServerUrl}/realms/${realm}/protocol/openid-connect/userinfo`;

  const params = {
    code: code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret
  };

  try {
    const { userInfo } = await exchangeCodeAndGetUserInfo(tokenUrl, userUrl, params);
    logger.log(`state: ${state}`);
    logger.log(`userInfo: ${JSON.stringify(userInfo)}`);

    const response = {
      userInfo: prettyHtml(userInfo),
      client_id: clientId,
      client_title: pageTitle,
      state
    };

    // store response for session complete
    await dataStore.set(state, response);
    // store user info with state
    await dataStore.set(`${state}-user-info`, userInfo);
    const auth_complete_url = `${baseUrl}/auth/complete?state=${state}`;

    if (ipBackchannelAuth) {
      logger.log('ipBackchannelAuth: true -> render 200');
      res.send();
      return;
    }

    // if check qr code in state and state have qrcode text
    // forward url to desktop browser to continue auth flow and exchange code
    if (isQrCodeState(state)) {
      handleQrCodeCallback(req, res, state, auth_complete_url, userInfo);
      return;
    }

    res.redirect(auth_complete_url);
  } catch (err) {
    logger.error('---> get token error:', err.message);
    if (err.response?.data) {
      logger.error('Error response data:', err.response.data);
    }
    res.status(HTTP_STATUS.BAD_REQUEST).send(err.message);
  }
})

router.get('/complete', async (req, res) => {
  const { state } = req.query || {};

  let response;
  let attempts = 0;

  while (attempts <= MAX_RETRY_ATTEMPTS) {
    response = await dataStore.get(state || '');
    if (response) {
      break;
    }
    await delay(RETRY_DELAY_MS);
    attempts += 1;
  }

  if (response) {
    // set user is logged in
    req.session.isAuthenticated = true;
    req.session.userData = response;
    res.redirect('/user/info');
    return;
  }
  res.redirect('/');
})

router.get('/qrcode/complete', async (req, res) => {
  res.render('qr_success');
})

router.get('/qrcode/error', async (req, res) => {
  res.render('qr_error');
})

router.post("/s2s/signin", async (req, res) => {
  const { state } = req.body || {};
  logger.log(`body: ${JSON.stringify(req.body || {})}`);
  const userinfo = await dataStore.get(`${state}-user-info`);

  if (userinfo) {
    // add your code here to create your app token and response to client
    res.send(userinfo);
  } else {
    res.status(HTTP_STATUS.UNAUTHORIZED).send();
  }
});

// support mobile side login and return user info
router.post('/mobile/login', async (req, res) => {
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

  const { url: authServerUrl } = authServer;

  const client = findClientByClientId(clients, client_id);
  if (!client) {
    logger.error(ERROR_MESSAGES.CLIENT_NOT_FOUND);
    res.status(HTTP_STATUS.UNAUTHORIZED).send({ error: ERROR_MESSAGES.CLIENT_NOT_FOUND });
    return;
  }

  const tokenUrl = `${authServerUrl}/realms/${realm}/protocol/openid-connect/token`;
  const userUrl = `${authServerUrl}/realms/${realm}/protocol/openid-connect/userinfo`;

  const params = {
    code: code,
    redirect_uri: redirect_uri,
    grant_type: 'authorization_code',
    client_id: client_id,
    client_secret: client.client_secret
  };

  try {
    const { userInfo } = await exchangeCodeAndGetUserInfo(tokenUrl, userUrl, params);
    logger.log(userInfo);

    const tokenResponse = {
      auth_server: authServer,
      ...userInfo,
    }

    res.send(tokenResponse);
  } catch (err) {
    logger.error('---> get token error:', err.message);
    res.status(HTTP_STATUS.UNAUTHORIZED).send({ error: err.message });
  }
});

module.exports = router;
