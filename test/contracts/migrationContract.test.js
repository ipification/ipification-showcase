const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const session = require('express-session');
const { randomUUID } = require('node:crypto');
const { client, server } = require('./fixtures');
const store = require('../../lib/data_store');

async function fixture(run) {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(session({ secret: 'test-only', resave: false, saveUninitialized: true }));
  app.use((req, res, next) => {
    res.locals = { clients: [client], auth_servers: [server], realm: 'fixture', baseUrl: 'https://showcase.example', getAuthServer: id => !id || id === server.id ? server : null };
    next();
  });
  app.use('/', require('../../routes/index'));
  app.use('/auth', require('../../routes/auth'));
  const listener = http.createServer(app);
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  try { await run((path, options) => fetch(`http://127.0.0.1:${listener.address().port}${path}`, { redirect: 'manual', ...options })); }
  finally { await new Promise(resolve => listener.close(resolve)); }
}

test('migration contract: config redacts secrets and retains callback without server id', () => fixture(async request => {
  const response = await request('/api/config');
  const data = await response.json();
  assert.equal(data.clients[0].redirect_uri, 'https://showcase.example/auth/callback/pvn_ip');
  assert.equal(Object.hasOwn(data.clients[0], 'client_secret'), false);
  assert.equal(JSON.stringify(data).includes(client.client_secret), false);
}));
test('migration contract: duplicate server and flow query keys retain lookup failures', () => fixture(async request => {
  const serverResponse = await request('/auth/start?user_flow=pvn_ip&state=s&server_id=stage&server_id=stage');
  assert.equal(serverResponse.status, 400);
  assert.deepEqual(await serverResponse.json(), { error: 'INVALID_SERVER_ID' });
  const flowResponse = await request('/auth/start?user_flow=pvn_ip&user_flow=pvn_ip&state=s');
  assert.equal(flowResponse.status, 200);
  assert.equal(await flowResponse.text(), 'Client not found');
}));
test('migration contract: S2S accepts JSON and urlencoded without consuming results', () => fixture(async request => {
  const state = randomUUID();
  await store.set(`${state}-user-info`, { sub: 'fixture-sub' });
  for (const [contentType, body] of [['application/json', JSON.stringify({state})], ['application/x-www-form-urlencoded', new URLSearchParams({state}).toString()]]) {
    const response = await request('/auth/s2s/signin', {method:'POST',headers:{'content-type':contentType},body});
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {sub:'fixture-sub'});
  }
}));
test('migration contract: urlencoded mobile body follows invalid-client JSON response', () => fixture(async request => {
  const response = await request('/auth/mobile/login', {method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'client_id=missing'});
  assert.equal(response.status,401);
  assert.deepEqual(await response.json(), {error:'Client not found'});
}));
