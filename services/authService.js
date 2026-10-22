const { v4: uuidv4 } = require('uuid');
const qs = require('qs');
const { exchangeCodeAndGetUserInfo } = require('../utils/httpClient');

function buildAuthorizationUrl({ client, baseUrl, userFlow, server, realm, state, phone }) {
  const { client_id: clientId, scope, channel } = client;
  const params = {
    response_type: 'code',
    client_id: clientId,
    redirect_uri: `${baseUrl}/auth/callback/${userFlow}/${server.id}`,
    scope,
    state,
    nonce: uuidv4(),
    ui_locales: 'en',
    consent_id: process.env.CONSENT_ID,
    consent_timestamp: Math.floor(Date.now() / 1000),
    env: process.env.NODE_ENV || 'development',
  };

  if (channel) params.channel = channel;
  if (phone) params.login_hint = phone;

  const endpoint = userFlow === 'pvn_ipificator'
    ? 'https://ipificator.ipification.com/api'
    : `${server.url}/realms/${realm}/protocol/openid-connect/auth`;
  return `${endpoint}?${qs.stringify(params)}`;
}

async function exchangeAuthorizationCode({ server, realm, clientId, clientSecret, redirectUri, code }) {
  const tokenUrl = `${server.url}/realms/${realm}/protocol/openid-connect/token`;
  const userUrl = `${server.url}/realms/${realm}/protocol/openid-connect/userinfo`;
  const params = {
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
  };
  return exchangeCodeAndGetUserInfo(tokenUrl, userUrl, params);
}

module.exports = { buildAuthorizationUrl, exchangeAuthorizationCode };
