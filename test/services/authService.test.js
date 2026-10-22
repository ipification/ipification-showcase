const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const express = require('express');
const { buildAuthorizationUrl, exchangeAuthorizationCode } = require('../../services/authService');

const authorization = {
  client: { client_id: 'demo', scope: 'openid ip:phone', channel: 'wa' },
  baseUrl: 'https://showcase.example', userFlow: 'pvn_ip',
  server: { id: 'stage', url: 'https://provider.example/auth' }, realm: 'demo', state: 'original-state', phone: '+12025550123',
};

test('authorization service builds the provider URL and all request fields', () => {
  const url = new URL(buildAuthorizationUrl(authorization));
  assert.equal(url.origin + url.pathname, 'https://provider.example/auth/realms/demo/protocol/openid-connect/auth');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://showcase.example/auth/callback/pvn_ip/stage');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('client_id'), 'demo');
  assert.equal(url.searchParams.get('scope'), 'openid ip:phone');
  assert.equal(url.searchParams.get('state'), 'original-state');
  assert.equal(url.searchParams.get('channel'), 'wa');
  assert.equal(url.searchParams.get('login_hint'), '+12025550123');
  assert.equal(url.searchParams.get('ui_locales'), 'en');
});

test('authorization service preserves IPificator endpoint and omits absent optional fields', () => {
  const url = new URL(buildAuthorizationUrl({ ...authorization, userFlow: 'pvn_ipificator', client: { client_id: 'demo', scope: 'openid' }, phone: undefined }));
  assert.equal(url.origin + url.pathname, 'https://ipificator.ipification.com/api');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://showcase.example/auth/callback/pvn_ipificator/stage');
  assert.equal(url.searchParams.has('login_hint'), false);
  assert.equal(url.searchParams.has('channel'), false);
});

test('code exchange uses explicit client and redirect parameters and returns token plus userinfo', async () => {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  const requests = [];
  app.post('/realms/demo/protocol/openid-connect/:operation', (req, res) => {
    requests.push({ operation: req.params.operation, body: req.body, contentType: req.headers['content-type'] });
    res.json(req.params.operation === 'token' ? { access_token: 'local-token', expires_in: 60 } : { sub: 'demo-user' });
  });
  const server = http.createServer(app);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try {
    const result = await exchangeAuthorizationCode({
      server: { url: `http://127.0.0.1:${server.address().port}` }, realm: 'demo', clientId: 'request-client', clientSecret: 'test-only-secret', redirectUri: 'demo://callback', code: 'test-code',
    });
    assert.deepEqual(result, { tokenInfo: { access_token: 'local-token', expires_in: 60 }, userInfo: { sub: 'demo-user' } });
    assert.deepEqual(requests.map(({ operation, body }) => ({ operation, body })), [
      { operation: 'token', body: { code: 'test-code', redirect_uri: 'demo://callback', grant_type: 'authorization_code', client_id: 'request-client', client_secret: 'test-only-secret' } },
      { operation: 'userinfo', body: { access_token: 'local-token' } },
    ]);
    for (const req of requests) assert.match(req.contentType, /^application\/x-www-form-urlencoded/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
