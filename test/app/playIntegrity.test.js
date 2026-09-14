const http = require('node:http');
const test = require('node:test');
const assert = require('node:assert/strict');

function loadFeatureEnabledApp(verify) {
  const appPath = require.resolve('../../app');
  const playIntegrityService = require('../../services/playIntegrityService');
  const originalEnabled = process.env.PLAY_INTEGRITY_ENABLED;
  const originalStateSecret = process.env.PLAY_INTEGRITY_STATE_SECRET;
  const originalStateIssuer = process.env.PLAY_INTEGRITY_STATE_ISSUER;
  const originalStateAudience = process.env.PLAY_INTEGRITY_STATE_AUDIENCE;
  const originalUserFlow = process.env.PLAY_INTEGRITY_USER_FLOW;
  const originalCreateService = playIntegrityService.createPlayIntegrityService;

  process.env.PLAY_INTEGRITY_ENABLED = 'true';
  process.env.PLAY_INTEGRITY_STATE_SECRET = 'test-state-secret';
  process.env.PLAY_INTEGRITY_STATE_ISSUER = 'test-issuer';
  process.env.PLAY_INTEGRITY_STATE_AUDIENCE = 'test-audience';
  process.env.PLAY_INTEGRITY_USER_FLOW = 'pvn_ip';
  playIntegrityService.createPlayIntegrityService = () => ({ verify });
  delete require.cache[appPath];

  try {
    return require('../../app');
  } finally {
    playIntegrityService.createPlayIntegrityService = originalCreateService;
    if (originalEnabled === undefined) delete process.env.PLAY_INTEGRITY_ENABLED;
    else process.env.PLAY_INTEGRITY_ENABLED = originalEnabled;
    if (originalStateSecret === undefined) delete process.env.PLAY_INTEGRITY_STATE_SECRET;
    else process.env.PLAY_INTEGRITY_STATE_SECRET = originalStateSecret;
    if (originalStateIssuer === undefined) delete process.env.PLAY_INTEGRITY_STATE_ISSUER;
    else process.env.PLAY_INTEGRITY_STATE_ISSUER = originalStateIssuer;
    if (originalStateAudience === undefined) delete process.env.PLAY_INTEGRITY_STATE_AUDIENCE;
    else process.env.PLAY_INTEGRITY_STATE_AUDIENCE = originalStateAudience;
    if (originalUserFlow === undefined) delete process.env.PLAY_INTEGRITY_USER_FLOW;
    else process.env.PLAY_INTEGRITY_USER_FLOW = originalUserFlow;
  }
}

async function withServer(app, run) {
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    await run(`http://127.0.0.1:${port}/api/play-integrity/attempt`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function assertInvalidRequest(response) {
  assert.equal(response.status, 400);
  const responseBody = await response.json();
  assert.equal(typeof responseBody.request_id, 'string');
  assert.notEqual(responseBody.request_id, '');
  assert.deepEqual({ ...responseBody, request_id: 'generated-request-id' }, {
    request_id: 'generated-request-id',
    decision: 'deny', reason_codes: ['INVALID_REQUEST'],
  });
}

test('mounted Play Integrity endpoint safely rejects malformed and oversized JSON', async () => {
  let verifyCalls = 0;
  const app = loadFeatureEnabledApp(async () => {
    verifyCalls += 1;
    return {
      decision: 'allow',
      reasonCodes: [],
      requestHashMatched: true,
      verdict: null,
    };
  });

  await withServer(app, async (url) => {
    await assertInvalidRequest(await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"integrityToken":',
    }));

    await assertInvalidRequest(await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone_number: '+84901234567', server_id: 'stage', value: 'x'.repeat(17 * 1024) }),
    }));
  });

  assert.equal(verifyCalls, 0);
});
