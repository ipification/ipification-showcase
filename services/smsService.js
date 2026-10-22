const axios = require('axios');
const qs = require('qs');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { getFormUrlEncodedConfig, getJsonConfig, getUserInfo } = require('../utils/httpClient');

function buildCibaAuthFormData(clientId, clientSecret, reqScope, scope, loginHint) {
  const formData = {
    client_id: clientId,
    client_secret: clientSecret,
    scope: reqScope || scope || 'openid',
    login_hint: loginHint,
    channel: 'sms',
    message: 'Your verification PIN is: {{code}}'
  };

  return formData;
}

/** Start SMS authentication and return the provider request identifiers. */
async function startAuthentication({ authServerUrl, realm, clientId, clientSecret, reqScope, scope, loginHint }) {
  const authUrl = `${authServerUrl}/realms/${realm}/protocol/openid-connect/ext/ciba/auth`;
  const smsNonce = uuidv4();
  const formData = buildCibaAuthFormData(clientId, clientSecret, reqScope, scope, loginHint);

  logger.log('sms authUrl', authUrl);
  logger.log('sms formData', formData);

  const authResponse = await axios.post(authUrl, qs.stringify(formData), getFormUrlEncodedConfig());
  logger.log('SMS auth response:', authResponse.data);

  const authReqId = authResponse.data.auth_req_id;

  if (!authReqId) {
    throw new Error('No authReqId received from auth response');
  }

  return { authReqId, nonce: smsNonce };
}

async function callCallbackEndpoint(callbackUrl, authReqId, smsCode) {
  try {
    const callbackPayload = { code: smsCode };
    logger.log('sms callbackUrl', callbackUrl);
    logger.log('sms authReqId', authReqId);
    logger.log('sms callbackPayload', callbackPayload);

    const callbackResponse = await axios.post(callbackUrl, callbackPayload, {
      headers: {
        Authorization: `Bearer ${authReqId}`,
        ...getJsonConfig().headers
      }
    });

    logger.log(`SMS callback response status: ${callbackResponse.status}, data: ${JSON.stringify(callbackResponse.data)}`);
  } catch (error) {
    // Keep token exchange available even when this callback fails.
    logger.error('SMS callback error:', error.message);
  }
}

/** Complete the best-effort callback, then fetch the token and raw userinfo. */
async function exchangeToken({ authServerUrl, realm, clientId, clientSecret, authReqId, smsCode }) {
  const callbackUrl = `${authServerUrl}/realms/${realm}/protocol/openid-connect/ext/bc/sms/callback`;
  await callCallbackEndpoint(callbackUrl, authReqId, smsCode);

  const tokenUrl = `${authServerUrl}/realms/${realm}/protocol/openid-connect/token`;
  const formData = {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'urn:openid:params:grant-type:ciba',
    auth_req_id: authReqId,
  };

  logger.log('sms tokenUrl', tokenUrl);
  logger.log('sms formData', formData);

  const authResponse = await axios.post(tokenUrl, qs.stringify(formData), getFormUrlEncodedConfig());
  logger.log('SMS token response:', authResponse.data);

  const { access_token: accessToken } = authResponse.data;
  const userUrl = `${authServerUrl}/realms/${realm}/protocol/openid-connect/userinfo`;
  const userInfo = await getUserInfo(userUrl, accessToken);

  return userInfo;
}

module.exports = { startAuthentication, exchangeToken };
