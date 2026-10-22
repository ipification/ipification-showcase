const assert = require('node:assert/strict');
const test = require('node:test');
const { createAppLocalsMiddleware } = require('../../middleware/appLocals');

const configFixture = () => ({
  title: 'Configured title',
  client_id: 'shared-client',
  client_secret: 'shared-test-secret',
  locale: { source: 'config-only' },
  auth_servers: [{ id: 'stage', url: 'https://provider.example' }, { id: 'live', url: 'https://live.example' }],
  clients: [
    { user_flow: 'pvn_ip', title: 'IP', client_id: '', client_secret: '' },
    { user_flow: 'pvn_im', title: 'IM', client_id: 'own-client', client_secret: 'own-test-secret' },
  ],
});

function invoke(middleware, locals = {}) {
  const res = { locals };
  let nextCalls = 0;
  middleware({ protocol: 'https', headers: { host: 'showcase.example:8443' } }, res, () => { nextCalls++; });
  assert.equal(nextCalls, 1);
  return res.locals;
}

test('locals preserve earlier values and apply client credential fallbacks without mutating config', () => {
  const config = configFixture();
  const locale = { source: 'merged-locale' };
  const middleware = createAppLocalsMiddleware({ config, locale });
  const locals = invoke(middleware, { request_id: 'earlier-middleware', title: 'Earlier title' });
  assert.equal(locals.request_id, 'earlier-middleware');
  assert.equal(locals.title, 'Configured title');
  assert.equal(locals.baseUrl, 'https://showcase.example:8443');
  assert.strictEqual(locals.locale, locale);
  assert.deepEqual(locals.clients, [
    { user_flow: 'pvn_ip', title: 'IP', client_id: 'shared-client', client_secret: 'shared-test-secret' },
    { user_flow: 'pvn_im', title: 'IM', client_id: 'own-client', client_secret: 'own-test-secret' },
  ]);
  assert.equal(config.clients[0].client_id, '');
  assert.equal(config.clients[0].client_secret, '');
  assert.notStrictEqual(locals.clients[1], config.clients[1]);
});

test('locals resolve default/explicit server and flow title with the existing fallbacks', () => {
  const config = configFixture();
  const locals = invoke(createAppLocalsMiddleware({ config, locale: {} }));
  assert.equal(locals.get_flow_title('pvn_ip', 'Fallback'), 'IP');
  assert.equal(locals.get_flow_title('unknown', 'Fallback'), 'Fallback');
  assert.deepEqual(locals.getAuthServer(), { id: 'stage', url: 'https://provider.example' });
  assert.deepEqual(locals.getAuthServer('live'), { id: 'live', url: 'https://live.example' });
  assert.equal(locals.getAuthServer('unknown'), null);
});

test('locals are computed for each request and read the current environment', t => {
  const oldEnv = process.env.NODE_ENV;
  t.after(() => { if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv; });
  const config = configFixture();
  delete config.title;
  const middleware = createAppLocalsMiddleware({ config, locale: {} });
  delete process.env.NODE_ENV;
  const first = invoke(middleware);
  assert.equal(first.app_env, 'development');
  assert.equal(first.title, 'IPification Showcase');
  config.client_id = 'updated-client';
  process.env.NODE_ENV = 'stage';
  const second = invoke(middleware);
  assert.equal(second.clients[0].client_id, 'updated-client');
  assert.equal(second.app_env, 'stage');
  assert.equal(first.clients[0].client_id, 'shared-client');
});
