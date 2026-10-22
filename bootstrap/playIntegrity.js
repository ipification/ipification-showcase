const playIntegrityService = require('../services/playIntegrityService');
const { createPlayIntegrityAttemptService } = require('../services/playIntegrityAttemptService');
const { createPlayIntegrityRouter } = require('../routes/playIntegrity');
const dataStore = require('../lib/data_store');
const { exchangeCodeAndGetUserInfo } = require('../utils/httpClient');
const { isPlayIntegrityVerificationDomain } = require('../utils/playIntegrityDomain');

/** Mount the optional feature before the app's general body parsers. */
function setupPlayIntegrity(app, { config }) {
  if (process.env.PLAY_INTEGRITY_ENABLED === 'true') {
    const { verify } = playIntegrityService.createPlayIntegrityService({
      packageName: process.env.PLAY_INTEGRITY_PACKAGE_NAME,
      requireLicensedApp: process.env.PLAY_INTEGRITY_REQUIRE_LICENSED_APP === 'true',
      timeoutMs: 10_000,
    });
    const attemptService = createPlayIntegrityAttemptService({
      dataStore,
      stateSecret: process.env.PLAY_INTEGRITY_STATE_SECRET,
      stateIssuer: process.env.PLAY_INTEGRITY_STATE_ISSUER,
      stateAudience: process.env.PLAY_INTEGRITY_STATE_AUDIENCE,
    });
    app.use('/api/play-integrity', createPlayIntegrityRouter({
      attemptService,
      verify,
      exchangeCodeAndGetUserInfo,
      expectedPackageName: process.env.PLAY_INTEGRITY_PACKAGE_NAME,
      userFlow: process.env.PLAY_INTEGRITY_USER_FLOW,
      verifyRequiredForRequest: (req) => isPlayIntegrityVerificationDomain(
        req.hostname,
        config.play_integrity_verify_domains,
      ),
    }));
  }
}

module.exports = { setupPlayIntegrity };
