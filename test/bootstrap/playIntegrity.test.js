const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const express = require('express');
const { setupPlayIntegrity } = require('../../bootstrap/playIntegrity');
const { createAppLocalsMiddleware } = require('../../middleware/appLocals');
const playIntegrityService = require('../../services/playIntegrityService');

function configureEnv(t, enabled = 'true') {
  const values = {
    PLAY_INTEGRITY_ENABLED: enabled,
    PLAY_INTEGRITY_PACKAGE_NAME: 'com.example.setup',
    PLAY_INTEGRITY_REQUIRE_LICENSED_APP: 'true',
    PLAY_INTEGRITY_STATE_SECRET: 'test-only-setup-secret',
    PLAY_INTEGRITY_STATE_ISSUER: 'setup-test',
    PLAY_INTEGRITY_STATE_AUDIENCE: 'setup-mobile',
    PLAY_INTEGRITY_USER_FLOW: 'pvn_ip',
  };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const configFixture = () => ({
  realm: 'demo', client_id: 'test-client', client_secret: 'test-client-secret',
  clients: [{ user_flow: 'pvn_ip', title: 'IP', scope: 'openid ip:phone_verify' }],
  auth_servers: [{ id: 'stage', url: 'https://provider.example/auth' }],
  play_integrity_verify_domains: ['127.0.0.1'],
});

function setup(config) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(createAppLocalsMiddleware({ config, locale: {} }));
  setupPlayIntegrity(app, { config });
  // Feature parser must see its requests before this general parser.
  app.use(express.json());
  app.post('/echo', (req, res) => res.json({ length: req.body.value.length }));
  return app;
}

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (route, body, headers = {}) => fetch(`${base}${route}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  try { await run(post); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('disabled feature mounts no endpoint and does not initialize verification or attempt secrets', async t => {
  configureEnv(t, 'false');
  delete process.env.PLAY_INTEGRITY_STATE_SECRET;
  t.mock.method(playIntegrityService, 'createPlayIntegrityService', () => { assert.fail('disabled feature initialized Google verification'); });
  await withServer(setup(configFixture()), async post => {
    assert.equal((await post('/api/play-integrity/attempt', {})).status, 404);
    assert.deepEqual(await (await post('/echo', { value: 'normal' })).json(), { length: 6 });
  });
});

test('enabled feature retains 16kb parsing and safe JSON errors ahead of the global parser', async t => {
  configureEnv(t);
  t.mock.method(playIntegrityService, 'createPlayIntegrityService', () => ({ verify: async () => { assert.fail('invalid payload reached verification'); } }));
  await withServer(setup(configFixture()), async post => {
    for (const body of ['{"phone_number":', { value: 'x'.repeat(17 * 1024) }]) {
      const response = await post('/api/play-integrity/attempt', body);
      assert.equal(response.status, 400);
      const result = await response.json();
      assert.equal(typeof result.request_id, 'string');
      assert.ok(result.request_id.length > 0);
      assert.deepEqual({ ...result, request_id: 'generated' }, { request_id: 'generated', decision: 'deny', reason_codes: ['INVALID_REQUEST'] });
    }
    assert.deepEqual(await (await post('/echo', { value: 'x'.repeat(17 * 1024) })).json(), { length: 17 * 1024 });
  });
});

test('setup passes configured package/licensing/timeout and checks verification domains per request', async t => {
  configureEnv(t);
  const options = [];
  const verification = [];
  t.mock.method(playIntegrityService, 'createPlayIntegrityService', opts => {
    options.push(opts);
    return { verify: async input => { verification.push(input); return { decision: 'allow', reasonCodes: [] }; } };
  });
  await withServer(setup(configFixture()), async post => {
    for (const host of ['127.0.0.1', 'bypass.example']) {
      const attempt = await post('/api/play-integrity/attempt', { phone_number: '+12025550123', server_id: 'stage' }, { 'x-forwarded-host': host });
      assert.equal(attempt.status, 201);
      const body = await attempt.json();
      const response = await post('/api/play-integrity/verify', { attempt_id: body.attempt_id, integrity_token: 'local-test-token' }, { 'x-forwarded-host': host });
      assert.equal(response.status, 201);
      const approved = await response.json();
      assert.equal(typeof approved.state, 'string');
      if (host === '127.0.0.1') {
        assert.deepEqual(verification, [{ integrityToken: 'local-test-token', expectedRequestHash: body.request_hash, expectedPackageName: 'com.example.setup' }]);
      }
    }
  });
  assert.equal(verification.length, 1);
  assert.deepEqual(options, [{ packageName: 'com.example.setup', requireLicensedApp: true, timeoutMs: 10000 }]);
});

test('enabled feature still fails startup when attempt state configuration is missing', t => {
  configureEnv(t);
  delete process.env.PLAY_INTEGRITY_STATE_SECRET;
  t.mock.method(playIntegrityService, 'createPlayIntegrityService', () => ({ verify: async () => ({ decision: 'allow' }) }));
  assert.throws(() => setup(configFixture()), /stateSecret is required/);
});
