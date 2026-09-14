const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');

const PLAY_INTEGRITY_SCOPE = 'https://www.googleapis.com/auth/playintegrity';

class PlayIntegrityUnavailableError extends Error {
  constructor(reasonCode, cause) {
    super(reasonCode);
    this.name = 'PlayIntegrityUnavailableError';
    this.reasonCode = reasonCode;
    this.cause = cause;
  }
}

function createPlayIntegrityService({
  packageName,
  requireLicensedApp = false,
  authClient = new GoogleAuth({ scopes: [PLAY_INTEGRITY_SCOPE] }),
  httpClient = axios,
  timeoutMs,
  now = () => new Date(),
}) {
  async function verify({ integrityToken, expectedRequestHash, expectedPackageName, maxAgeMs }) {
    const accessToken = await getAccessToken(authClient);
    const decoded = await decodeIntegrityToken({
      httpClient,
      packageName: expectedPackageName || packageName,
      integrityToken,
      accessToken,
      timeoutMs,
    });

    return evaluateVerdict({
      decoded,
      expectedRequestHash,
      expectedPackageName: expectedPackageName || packageName,
      maxAgeMs,
      nowMs: currentTimeMs(now),
      requireLicensedApp,
    });
  }

  return { verify };
}

async function getAccessToken(authClient) {
  try {
    const credential = await authClient.getAccessToken();
    const token = typeof credential === 'string' ? credential : credential?.token;
    if (!token) throw new Error('access token unavailable');
    return token;
  } catch (error) {
    throw new PlayIntegrityUnavailableError('GOOGLE_CREDENTIALS_UNAVAILABLE', error);
  }
}

async function decodeIntegrityToken({ httpClient, packageName, integrityToken, accessToken, timeoutMs }) {
  try {
    const response = await httpClient.post(
      `https://playintegrity.googleapis.com/v1/${packageName}:decodeIntegrityToken`,
      { integrity_token: integrityToken },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: timeoutMs,
      },
    );
    return response.data;
  } catch (error) {
    const reasonCode = ['ECONNABORTED', 'ETIMEDOUT'].includes(error?.code)
      ? 'GOOGLE_DECODE_TIMEOUT'
      : 'GOOGLE_DECODE_FAILED';
    throw new PlayIntegrityUnavailableError(reasonCode, error);
  }
}

function evaluateVerdict({
  decoded,
  expectedRequestHash,
  expectedPackageName,
  maxAgeMs,
  nowMs,
  requireLicensedApp,
}) {
  const tokenPayload = decoded?.tokenPayloadExternal;
  const requestDetails = tokenPayload?.requestDetails;
  const requestHash = requestDetails?.requestHash;
  const requestPackageName = requestDetails?.requestPackageName;
  const timestampMillis = Number(requestDetails?.timestampMillis);
  const appRecognition = tokenPayload?.appIntegrity?.appRecognitionVerdict ?? null;
  const deviceIntegrity = Array.isArray(tokenPayload?.deviceIntegrity?.deviceRecognitionVerdict)
    ? tokenPayload.deviceIntegrity.deviceRecognitionVerdict
    : [];
  const appLicensing = tokenPayload?.accountDetails?.appLicensingVerdict ?? null;
  const requestHashMatched = requestHash === expectedRequestHash;
  const packageNameMatched = requestPackageName === expectedPackageName;
  const requestIsFresh = Number.isFinite(timestampMillis)
    && Number.isFinite(maxAgeMs)
    && maxAgeMs > 0
    && timestampMillis <= nowMs
    && nowMs - timestampMillis <= maxAgeMs;
  const reasonCodes = [];

  if (!requestHashMatched) reasonCodes.push('REQUEST_HASH_MISMATCH');
  if (!packageNameMatched) reasonCodes.push('PACKAGE_NAME_MISMATCH');
  if (!requestIsFresh) reasonCodes.push('REQUEST_TOO_OLD');
  if (appRecognition !== 'PLAY_RECOGNIZED') reasonCodes.push('APP_NOT_RECOGNIZED');
  if (!deviceIntegrity.includes('MEETS_DEVICE_INTEGRITY')) {
    reasonCodes.push('DEVICE_INTEGRITY_NOT_MET');
  }
  if (requireLicensedApp && appLicensing !== 'LICENSED') reasonCodes.push('APP_NOT_LICENSED');

  return {
    decision: reasonCodes.length === 0 ? 'allow' : 'deny',
    reasonCodes,
    requestHashMatched,
    verdict: {
      appRecognition,
      deviceIntegrity,
      appLicensing,
    },
  };
}

function currentTimeMs(now) {
  const value = now();
  const milliseconds = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(milliseconds)) throw new TypeError('now must return a valid time');
  return milliseconds;
}

module.exports = { createPlayIntegrityService, PlayIntegrityUnavailableError };
