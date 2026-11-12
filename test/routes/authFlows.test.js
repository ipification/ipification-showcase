const assert = require('node:assert/strict');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const express = require('express');
const session = require('express-session');
const path = require('node:path');
const authRouter = require('../../routes/auth');
const dataStore = require('../../lib/data_store');
const locale = require('../../config/locale.json');

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function listen(app) {
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

// Real provider HTTP and real cache; only the desktop socket is a recording stub.
async function withAuth(run, { userInfo = { phone_number: '+12025550123', phone_number_verified: 'true' }, failProvider = false, failSecondWrite = false } = {}) {
  const provider = express();
  provider.use(express.urlencoded({ extended: false }));
  const requests = [];
  provider.post('/realms/demo/protocol/openid-connect/:operation', (req, res) => {
    requests.push({ operation: req.params.operation, body: req.body });
    if (failProvider) return res.status(502).json({ error: 'provider-failure' });
    res.json(req.params.operation === 'token' ? { access_token: 'test-access-token' } : userInfo);
  });
  const upstream = await listen(provider);
  const server = { id: 'stage', url: upstream.url };
  const secondServer = { id: 'live', url: `${upstream.url}/live` };
  const client = { user_flow: 'pvn_ip', client_id: 'demo-client', client_secret: 'test-only-secret', scope: 'openid ip:phone_verify', title: 'Phone', channel: 'wa' };
  const app = express();
  app.set('views', path.join(__dirname, '../../views'));
  app.set('view engine', 'pug');
  app.use(express.json());
  app.use(session({ secret: 'test-only-session-secret', resave: false, saveUninitialized: true }));
  const events = [];
  const order = [];
  app.set('socket', { to: room => ({ emit: (event, payload) => { order.push('socket'); events.push({ room, event, payload }); } }) });
  app.use((req, res, next) => {
    res.locals = {
      clients: [client, { ...client, user_flow: 'pvn_ipificator' }],
      getAuthServer: id => !id || id === 'stage' ? server : id === 'live' ? secondServer : null,
      realm: 'demo', baseUrl: 'https://showcase.example', auth_servers: [server, secondServer],
      locale, get_flow_title: () => '',
    };
    next();
  });
  app.get('/test/session', (req, res) => res.json(req.session));
  app.use('/auth', authRouter);
  const originalSet = dataStore.set;
  dataStore.set = async (key, value, ...args) => {
    if (failSecondWrite && key.endsWith('-user-info')) throw new Error('second write failed');
    const result = await originalSet.call(dataStore, key, value, ...args);
    order.push(key.endsWith('-user-info') ? 'raw-userinfo' : 'result');
    return result;
  };
  let local;
  try {
    local = await listen(app);
    const request = (route, options = {}) => fetch(`${local.url}/auth${route}`, { redirect: 'manual', ...options });
    const post = (route, body) => request(route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    await run({ request, post, events, order, requests, client, server, localUrl: local.url });
  } finally {
    dataStore.set = originalSet;
    if (local) await new Promise(resolve => local.server.close(resolve));
    await new Promise(resolve => upstream.server.close(resolve));
  }
}

test('start constructs authorization fields with default and explicit server selection', async () => {
  await withAuth(async ({ request, server }) => {
    const before = Math.floor(Date.now() / 1000);
    const response = await request('/start?user_flow=pvn_ip&state=original-state&phone=%2B12025550123');
    assert.equal(response.status, 302);
    const url = new URL(response.headers.get('location'));
    assert.equal(url.origin, server.url);
    assert.equal(url.pathname, '/realms/demo/protocol/openid-connect/auth');
    const fields = Object.fromEntries(url.searchParams);
    assert.deepEqual({ ...fields, nonce: undefined, consent_timestamp: undefined, consent_id: undefined, env: undefined }, {
      response_type: 'code', client_id: 'demo-client', redirect_uri: 'https://showcase.example/auth/callback/pvn_ip/stage',
      scope: 'openid ip:phone_verify', state: 'original-state', nonce: undefined, ui_locales: 'en',
      consent_id: undefined, consent_timestamp: undefined, env: undefined, channel: 'wa', login_hint: '+12025550123',
    });
    assert.match(fields.nonce, uuidPattern);
    assert.equal(fields.env, process.env.NODE_ENV || 'development');
    assert.equal(fields.consent_id, process.env.CONSENT_ID);
    assert.ok(Number(fields.consent_timestamp) >= before && Number(fields.consent_timestamp) <= Math.floor(Date.now() / 1000));
    const explicit = new URL((await request('/start?user_flow=pvn_ip&state=s&server_id=live')).headers.get('location'));
    assert.equal(explicit.pathname, '/live/realms/demo/protocol/openid-connect/auth');
    assert.equal(explicit.searchParams.get('redirect_uri'), 'https://showcase.example/auth/callback/pvn_ip/live');
    assert.equal(explicit.searchParams.has('login_hint'), false);
  });
});

test('start retains IPificator URL and invalid client/server/state responses', async () => {
  await withAuth(async ({ request }) => {
    const special = new URL((await request('/start?user_flow=pvn_ipificator&state=s')).headers.get('location'));
    assert.equal(special.origin + special.pathname, 'https://ipificator.ipification.com/api');
    const invalidServer = await request('/start?server_id=unknown');
    assert.equal(invalidServer.status, 400);
    assert.deepEqual(await invalidServer.json(), { error: 'INVALID_SERVER_ID' });
    const invalidClient = await request('/start?user_flow=unknown&state=s');
    assert.equal(invalidClient.status, 200);
    assert.equal(await invalidClient.text(), 'Client not found');
    assert.equal((await request('/start?user_flow=pvn_ip')).headers.get('location'), '/auth/login');
  });
});

test('web callback exchanges code, stores formatted and raw results, then completes session', async () => {
  await withAuth(async ({ request, post, requests, localUrl, order }) => {
    const state = randomUUID();
    const callback = await request(`/callback/pvn_ip/stage?code=test-code&state=${state}`);
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get('location'), `https://showcase.example/auth/complete?state=${state}`);
    assert.deepEqual(requests, [
      { operation: 'token', body: { code: 'test-code', redirect_uri: 'https://showcase.example/auth/callback/pvn_ip/stage', grant_type: 'authorization_code', client_id: 'demo-client', client_secret: 'test-only-secret' } },
      { operation: 'userinfo', body: { access_token: 'test-access-token' } },
    ]);
    assert.deepEqual(order, ['result', 'raw-userinfo']);
    const stored = await dataStore.get(state);
    assert.equal(stored.state, state);
    assert.equal(stored.client_id, 'demo-client');
    assert.equal(stored.client_title, 'Phone');
    assert.match(stored.userInfo, /<.*phone_number/);
    const complete = await request(`/complete?state=${state}`);
    assert.equal(complete.headers.get('location'), '/user/info');
    const cookie = complete.headers.get('set-cookie').split(';', 1)[0];
    const sessionData = await (await fetch(`${localUrl}/test/session`, { headers: { cookie } })).json();
    assert.equal(sessionData.isAuthenticated, true);
    assert.deepEqual(sessionData.userData, stored);
    assert.deepEqual(await (await post('/s2s/signin', { state })).json(), { phone_number: '+12025550123', phone_number_verified: 'true' });
  });
});

for (const [verified, destination] of [['true', 'complete'], ['false', 'error'], [false, 'complete']]) {
  test(`QR callback preserves ${JSON.stringify(verified)} verification behavior and write/notify order`, async () => {
    await withAuth(async ({ request, events, order }) => {
      const state = `${randomUUID()}-qrcode-middle`;
      const response = await request(`/callback/pvn_ip/stage?code=c&state=${state}`);
      assert.equal(response.headers.get('location'), `/auth/qrcode/${destination}`);
      assert.deepEqual(order, ['result', 'raw-userinfo', 'socket']);
      assert.deepEqual(events, [{ room: `auth:${state}`, event: 'messages', payload: { event_name: 'url', url: `https://showcase.example/auth/complete?state=${state}` } }]);
      assert.equal((await request(`/qrcode/${destination}`)).status, 200);
    }, { userInfo: { phone_number_verified: verified } });
  });
}

test('backchannel takes precedence over QR, stores results and responds with empty 200', async () => {
  await withAuth(async ({ request, post, events, order }) => {
    const state = `${randomUUID()}-qrcode`;
    const response = await request(`/callback/pvn_ip/stage?code=c&state=${state}`, { headers: { 'ip-backchannel-im-auth': 'true' } });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '');
    assert.deepEqual(events, []);
    assert.deepEqual(order, ['result', 'raw-userinfo']);
    assert.equal((await post('/s2s/signin', { state })).status, 200);
    for (const body of [{ state: randomUUID() }, {}]) {
      const missing = await post('/s2s/signin', body);
      assert.equal(missing.status, 401);
      assert.equal(await missing.text(), '');
    }
  });
});

test('failed second cache write prevents QR notification and success redirect', async () => {
  await withAuth(async ({ request, events, order }) => {
    const response = await request(`/callback/pvn_ip/stage?code=c&state=${randomUUID()}-qrcode`);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/auth/login');
    const cookie = response.headers.get('set-cookie').split(';', 1)[0];
    const login = await request('/login', { headers: { cookie } });
    assert.match(await login.text(), /second write failed/);
    assert.deepEqual(events, []);
    assert.deepEqual(order, ['result']);
  }, { failSecondWrite: true });
});

test('callback generates a UUID when state is absent and retains lookup errors', async () => {
  await withAuth(async ({ request }) => {
    const response = await request('/callback/pvn_ip/stage?code=c');
    const state = new URL(response.headers.get('location')).searchParams.get('state');
    assert.match(state, uuidPattern);
    assert.equal((await dataStore.get(state)).state, state);
    const invalidServer = await request('/callback/pvn_ip/unknown');
    assert.equal(invalidServer.status, 400);
    assert.equal(await invalidServer.text(), "Invalid server_id: 'unknown'");
    assert.equal(await (await request('/callback/unknown/stage')).text(), 'Client not found');
  });
});

test('callback and mobile preserve their distinct provider failure responses', async () => {
  await withAuth(async ({ request, post }) => {
    const callback = await request(`/callback/pvn_ip/stage?code=c&state=${randomUUID()}`);
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get('location'), '/auth/login');
    const cookie = callback.headers.get('set-cookie').split(';', 1)[0];
    const login = await request('/login', { headers: { cookie } });
    assert.match(await login.text(), /provider-failure/);
    const nextLogin = await request('/login', { headers: { cookie } });
    assert.doesNotMatch(await nextLogin.text(), /provider-failure/);
    const mobile = await post('/mobile/login', { client_id: 'demo-client', code: 'c', redirect_uri: 'demo://callback' });
    assert.equal(mobile.status, 401);
    assert.deepEqual(await mobile.json(), { error: 'Request failed with status code 502' });
  }, { failProvider: true });
});

test('mobile exchanges request redirect URI, returns userinfo and preserves merge precedence', async () => {
  await withAuth(async ({ post, requests }) => {
    const response = await post('/mobile/login', { client_id: 'demo-client', code: 'mobile-code', redirect_uri: 'demo://callback', server_id: 'stage' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { auth_server: 'provider-value', phone_number: '+12025550123' });
    assert.deepEqual(requests[0].body, { code: 'mobile-code', redirect_uri: 'demo://callback', grant_type: 'authorization_code', client_id: 'demo-client', client_secret: 'test-only-secret' });
    const invalidServer = await post('/mobile/login', { server_id: 'unknown' });
    assert.equal(invalidServer.status, 400);
    assert.deepEqual(await invalidServer.json(), { error: "Invalid server_id: 'unknown'" });
    const invalidClient = await post('/mobile/login', { client_id: 'unknown' });
    assert.equal(invalidClient.status, 401);
    assert.deepEqual(await invalidClient.json(), { error: 'Client not found' });
  }, { userInfo: { auth_server: 'provider-value', phone_number: '+12025550123' } });
});
