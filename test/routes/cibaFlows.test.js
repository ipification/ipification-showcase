const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const express = require('express');
const session = require('express-session');

const protocols = ['ts43', 'sms'];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function listen(app) {
  const server = http.createServer(app);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

// All protocol calls hit a local provider, including the best-effort callback.
async function withProvider(protocol, run, options = {}) {
  const provider = express();
  provider.use(express.urlencoded({ extended: false }));
  provider.use(express.json());
  const requests = [];
  provider.post(/.*/, (req, res) => {
    const operation = req.path.endsWith('/ciba/auth') ? 'auth'
      : req.path.endsWith('/dcql') ? 'dcql'
        : req.path.endsWith('/callback') ? 'callback'
          : req.path.endsWith('/token') ? 'token' : 'userinfo';
    requests.push({ operation, path: req.path, body: req.body, authorization: req.headers.authorization, contentType: req.headers['content-type'] });
    if (options.failAt === operation) return res.status(503).json({ error: 'provider-unavailable' });
    const results = {
      auth: options.missingAuthReqId ? {} : { auth_req_id: 'provider-auth-id' },
      dcql: { id: 'phone', format: 'ts43' }, callback: { accepted: true },
      token: { access_token: 'provider-token' },
      userinfo: options.userInfo || { phone_number: '+12025550123', phone_number_verified: true },
    };
    res.json(results[operation]);
  });
  const upstream = await listen(provider);
  try { await run({ server: { id: 'stage', url: upstream.url }, requests }); }
  finally { await new Promise(resolve => upstream.server.close(resolve)); }
}

async function withRoutes(protocol, run, options = {}) {
  await withProvider(protocol, async ({ server, requests }) => {
    const app = express();
    app.use(express.json());
    app.use(session({ secret: 'test-only-ciba-session', resave: false, saveUninitialized: true }));
    const client = { client_id: 'test-client', client_secret: 'test-only-secret', scope: options.clientScope === undefined ? 'openid ip:phone' : options.clientScope, title: options.clientTitle === undefined ? 'Client title' : options.clientTitle };
    app.use((req, res, next) => {
      res.locals = { clients: [client], realm: 'demo', getAuthServer: id => !id || id === 'stage' ? server : null };
      next();
    });
    app.get('/test/session', (req, res) => res.json(req.session));
    app.use(`/${protocol}`, require(`../../routes/${protocol}`));
    const local = await listen(app);
    const post = (endpoint, body) => fetch(`${local.url}/${protocol}${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const sessionFor = async response => {
      const cookie = response.headers.get('set-cookie').split(';', 1)[0];
      return (await fetch(`${local.url}/test/session`, { headers: { cookie } })).json();
    };
    try { await run({ post, sessionFor, server, requests, client }); }
    finally { await new Promise(resolve => local.server.close(resolve)); }
  }, options);
}

for (const protocol of protocols) {
  test(`${protocol} auth preserves form fields, nonce, and protocol-specific response`, async () => {
    await withRoutes(protocol, async ({ post, requests, server }) => {
      const response = await post('/auth', { client_id: 'test-client', server_id: 'stage', login_hint: '+12025550123', carrier_hint: 'carrier', scope: 'requested-scope' });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.auth_server, server);
      assert.equal(body.auth_req_id, 'provider-auth-id');
      assert.match(body.nonce, uuidPattern);
      assert.equal(requests[0].path, '/realms/demo/protocol/openid-connect/ext/ciba/auth');
      const expectedForm = { client_id: 'test-client', client_secret: 'test-only-secret', scope: 'requested-scope', login_hint: '+12025550123' };
      if (protocol === 'sms') Object.assign(expectedForm, { channel: 'sms', message: 'Your verification PIN is: {{code}}' });
      else expectedForm.carrier_hint = 'carrier';
      assert.deepEqual(requests[0].body, expectedForm);
      assert.match(requests[0].contentType, /^application\/x-www-form-urlencoded/);
      if (protocol === 'ts43') {
        assert.deepEqual(requests[1].body, { operation: 'VerifyPhoneNumber', nonce: body.nonce });
        assert.equal(requests[1].authorization, 'Bearer provider-auth-id');
        assert.deepEqual(body.digital_request, { protocol: 'openid4vp-v1-unsigned', data: { response_type: 'vp_token', response_mode: 'dc_api', nonce: body.nonce, dcql_query: { credentials: [{ id: 'phone', format: 'ts43' }] } } });
      } else {
        assert.equal(requests.length, 1);
        assert.deepEqual(Object.keys(body).sort(), ['auth_req_id', 'auth_server', 'nonce']);
      }
    });
  });

  for (const [clientScope, expectedScope] of [['configured-scope', 'configured-scope'], ['', 'openid']]) {
    test(`${protocol} auth retains scope fallback to ${expectedScope}`, async () => {
      await withRoutes(protocol, async ({ post, requests }) => {
        assert.equal((await post('/auth', { client_id: 'test-client' })).status, 200);
        assert.equal(requests[0].body.scope, expectedScope);
        assert.equal(Object.hasOwn(requests[0].body, 'login_hint'), false);
        if (protocol === 'ts43') {
          assert.equal(requests[1].body.operation, 'GetPhoneNumber');
          assert.equal(Object.hasOwn(requests[0].body, 'carrier_hint'), false);
        }
      }, { clientScope });
    });
  }

  for (const options of [{ failAt: 'auth' }, { missingAuthReqId: true }, ...(protocol === 'ts43' ? [{ failAt: 'dcql' }] : [])]) {
    test(`${protocol} auth preserves provider error payload for ${JSON.stringify(options)}`, async () => {
      await withRoutes(protocol, async ({ post, requests, server }) => {
        const response = await post('/auth', { client_id: 'test-client' });
        const status = options.missingAuthReqId ? 500 : 503;
        assert.equal(response.status, status);
        assert.deepEqual(await response.json(), {
          auth_server: server, success: false,
          error: options.missingAuthReqId ? 'No authReqId received from auth response' : 'Request failed with status code 503',
          status, ...(options.missingAuthReqId ? {} : { data: { error: 'provider-unavailable' } }),
        });
        assert.equal(requests.length, options.failAt === 'dcql' ? 2 : 1);
      }, options);
    });
  }

  test(`${protocol} keeps endpoint-specific invalid server/client responses and log acknowledgement`, async () => {
    await withRoutes(protocol, async ({ post, requests }) => {
      for (const endpoint of ['/auth', '/token']) {
        const server = await post(endpoint, { server_id: 'unknown' });
        assert.equal(server.status, 400);
        assert.deepEqual(await server.json(), { error: "Invalid server_id: 'unknown'" });
        const client = await post(endpoint, { client_id: 'unknown' });
        assert.equal(client.status, 401);
        if (endpoint === '/auth') assert.equal(await client.text(), 'Client not found');
        else assert.deepEqual(await client.json(), { error: 'Client not found' });
      }
      assert.equal(await (await post('/log', { data: { note: 'local-test' } })).text(), 'OK');
      assert.deepEqual(requests, []);
    });
  });

  for (const failAt of [undefined, 'callback']) {
    test(`${protocol} token completes callback, token, userinfo, session even when callback ${failAt ? 'fails' : 'succeeds'}`, async () => {
      await withRoutes(protocol, async ({ post, requests, sessionFor, server }) => {
        const response = await post('/token', { client_id: 'test-client', auth_req_id: 'provider-auth-id', nonce: 'browser-nonce', vp_token: 'presentation', code: '123456' });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { auth_server: server, phone_number: '+12025550123', phone_number_verified: true });
        assert.deepEqual(requests.map(req => req.operation), ['callback', 'token', 'userinfo']);
        assert.equal(requests[0].path, `/realms/demo/protocol/openid-connect/ext/bc/${protocol}/callback`);
        assert.equal(requests[0].authorization, 'Bearer provider-auth-id');
        assert.deepEqual(requests[0].body, protocol === 'ts43' ? { vp_token: 'presentation' } : { code: '123456' });
        assert.deepEqual(requests[1].body, { client_id: 'test-client', client_secret: 'test-only-secret', grant_type: 'urn:openid:params:grant-type:ciba', auth_req_id: 'provider-auth-id' });
        assert.deepEqual(requests[2].body, { access_token: 'provider-token' });
        const stored = await sessionFor(response);
        assert.equal(stored.isAuthenticated, true);
        assert.equal(stored.userData.client_id, 'test-client');
        assert.equal(stored.userData.client_title, protocol === 'ts43' ? 'SIM' : 'Client title');
        assert.equal(stored.userData.state, 'browser-nonce');
        assert.match(stored.userData.userInfo, /phone_number/);
      }, { failAt });
    });
  }

  for (const failAt of ['token', 'userinfo']) {
    test(`${protocol} token ${failAt} error preserves status, provider data and error session`, async () => {
      await withRoutes(protocol, async ({ post, requests, sessionFor }) => {
        const response = await post('/token', { client_id: 'test-client', auth_req_id: 'provider-auth-id', nonce: 'browser-nonce', vp_token: 'presentation', code: '123456' });
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { error: 'Request failed with status code 503', status: 503, data: { error: 'provider-unavailable' } });
        assert.deepEqual(requests.map(req => req.operation), failAt === 'token' ? ['callback', 'token'] : ['callback', 'token', 'userinfo']);
        const stored = await sessionFor(response);
        assert.equal(stored.isAuthenticated, true);
        assert.equal(stored.userData.client_title, protocol === 'ts43' ? 'SIM' : 'Client title');
        assert.equal(stored.userData.state, 'browser-nonce');
        assert.match(stored.userData.userInfo, /provider-unavailable/);
      }, { failAt });
    });
  }

  test(`${protocol} token preserves userinfo spread precedence and SMS title fallback`, async () => {
    await withRoutes(protocol, async ({ post, sessionFor }) => {
      const response = await post('/token', { client_id: 'test-client', nonce: 'browser-nonce' });
      assert.deepEqual(await response.json(), { auth_server: 'provider-value' });
      assert.equal((await sessionFor(response)).userData.client_title, protocol === 'ts43' ? 'SIM' : 'SMS');
    }, { userInfo: { auth_server: 'provider-value' }, clientTitle: '' });
  });
}

test('TS43 retains an explicit operation instead of deriving it from login hint', async () => {
  await withRoutes('ts43', async ({ post, requests }) => {
    assert.equal((await post('/auth', { client_id: 'test-client', operation: 'CustomOperation', login_hint: '+12025550123' })).status, 200);
    assert.equal(requests[1].body.operation, 'CustomOperation');
  });
});

// These contracts also verify services can run without Express request/response objects.
for (const protocol of protocols) {
  test(`${protocol} service starts authentication without HTTP handler dependencies`, async () => {
    const service = require(`../../services/${protocol}Service`);
    await withProvider(protocol, async ({ server, requests }) => {
      const result = await service.startAuthentication({ authServerUrl: server.url, realm: 'demo', clientId: 'test-client', clientSecret: 'test-only-secret', reqScope: 'requested-scope', scope: 'client-scope', loginHint: '+12025550123' });
      assert.equal(result.authReqId, 'provider-auth-id');
      assert.match(result.nonce, uuidPattern);
      assert.equal(requests[0].body.scope, 'requested-scope');
      if (protocol === 'ts43') {
        assert.equal(result.digitalRequest.data.nonce, result.nonce);
        assert.equal(requests[1].body.operation, 'VerifyPhoneNumber');
      } else {
        assert.equal(requests[0].body.channel, 'sms');
      }
    });
  });

  test(`${protocol} service returns raw userinfo after callback failure without writing a session`, async () => {
    const service = require(`../../services/${protocol}Service`);
    await withProvider(protocol, async ({ server, requests }) => {
      const result = await service.exchangeToken({ authServerUrl: server.url, realm: 'demo', clientId: 'test-client', clientSecret: 'test-only-secret', authReqId: 'provider-auth-id', vpToken: 'presentation', smsCode: '123456' });
      assert.deepEqual(result, { phone_number: '+12025550123', phone_number_verified: true });
      assert.deepEqual(requests.map(req => req.operation), ['callback', 'token', 'userinfo']);
    }, { failAt: 'callback' });
  });
}
