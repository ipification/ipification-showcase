const axios = require('axios');
const qs = require('qs');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { getFormUrlEncodedConfig, getJsonConfig, getUserInfo } = require('../utils/httpClient');

function resolveOperation(operation, loginHint) {
  if (operation) {
    return operation;
  }
  return loginHint ? "VerifyPhoneNumber" : "GetPhoneNumber";
}

function buildCibaAuthFormData(clientId, clientSecret, reqScope, scope, loginHint, carrierHint) {
  const formData = {
    client_id: clientId,
    client_secret: clientSecret,
    scope: reqScope || scope || 'openid',
  };

  if (loginHint) {
    formData.login_hint = loginHint;
  }

  if (carrierHint) {
    formData.carrier_hint = carrierHint;
  }

  return formData;
}

function buildDigitalRequest(nonce, dcqlData) {
  return {
    protocol: "openid4vp-v1-unsigned",
    data: {
      response_type: "vp_token",
      response_mode: "dc_api",
      nonce: nonce,
      dcql_query: {
        credentials: [dcqlData]
      }
    }
  };
}

/** Start TS43 authentication and return the provider request identifiers. */
async function startAuthentication({ authServerUrl, realm, clientId, clientSecret, reqScope, scope, loginHint, carrierHint, operation }) {
  // CIBA auth endpoint
  const authUrl = `${authServerUrl}/realms/${realm}/protocol/openid-connect/ext/ciba/auth`;
  const nonce = uuidv4();

  const formData = buildCibaAuthFormData(clientId, clientSecret, reqScope, scope, loginHint, carrierHint);

  logger.log('authUrl', authUrl);
  logger.log('formData', formData);

  const authResponse = await axios.post(authUrl, qs.stringify(formData), getFormUrlEncodedConfig());
  logger.log('Auth response:', authResponse.data);

  const authReqId = authResponse.data.auth_req_id;

  if (!authReqId) {
    throw new Error('No authReqId received from auth response');
  }

  const resolvedOperation = resolveOperation(operation, loginHint);

  // Make the second API call to dcql endpoint
  const dcqlUrl = `${authServerUrl}/realms/${realm}/protocol/openid-connect/ext/bc/ts43/dcql`;
  const dcqlPayload = {
    operation: resolvedOperation,
    nonce
  };

  logger.log('dcqlUrl', dcqlUrl);
  logger.log('dcqlPayload', dcqlPayload);

  const dcqlResponse = await axios.post(dcqlUrl, dcqlPayload, {
    headers: {
      'Authorization': `Bearer ${authReqId}`,
      ...getJsonConfig().headers
    }
  });

  logger.log('DCQL response:', dcqlResponse.data);

  return { authReqId, nonce, digitalRequest: buildDigitalRequest(nonce, dcqlResponse.data) };
}

async function callCallbackEndpoint(callbackUrl, vpToken, authReqId) {
  try {
    const callbackPayload = { vp_token: vpToken };
    logger.log('callbackUrl', callbackUrl);
    logger.log('callbackPayload', callbackPayload);

    const callbackResponse = await axios.post(callbackUrl, callbackPayload, {
      headers: {
        'Authorization': `Bearer ${authReqId}`,
        ...getJsonConfig().headers
      }
    });

    logger.log('Callback response:', callbackResponse.data);
  } catch (error) {
    // Keep token exchange available even when this callback fails.
    logger.error('Callback Error:', error.message);
  }
}

/** Complete the best-effort callback, then fetch the token and raw userinfo. */
async function exchangeToken({ authServerUrl, realm, clientId, clientSecret, authReqId, vpToken }) {
  const callbackUrl = `${authServerUrl}/realms/${realm}/protocol/openid-connect/ext/bc/ts43/callback`;
  await callCallbackEndpoint(callbackUrl, vpToken, authReqId);

  const tokenUrl = `${authServerUrl}/realms/${realm}/protocol/openid-connect/token`;
  const formData = {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "urn:openid:params:grant-type:ciba",
    auth_req_id: authReqId,
  };

  logger.log('tokenUrl', tokenUrl);
  logger.log('formData', formData);

  const authResponse = await axios.post(tokenUrl, qs.stringify(formData), getFormUrlEncodedConfig());
  logger.log('Token response:', authResponse.data);

  const { access_token: accessToken } = authResponse.data;
  const userUrl = `${authServerUrl}/realms/${realm}/protocol/openid-connect/userinfo`;

  const userInfo = await getUserInfo(userUrl, accessToken);

  return userInfo;
}

module.exports = { startAuthentication, exchangeToken };
