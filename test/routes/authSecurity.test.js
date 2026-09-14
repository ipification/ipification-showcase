const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const express = require('express');
const session = require('express-session');

const authRouter = require('../../routes/auth');
const locale = require('../../config/locale.json');

async function withAuthApp(handler) {
  const app = express();
  app.set('views', path.join(__dirname, '../../views'));
  app.set('view engine', 'pug');
  app.use(session({ secret: 'test-session-secret', resave: false, saveUninitialized: true }));
  app.use((req, res, next) => {
    res.locals = {
      clients: [],
      auth_servers: [],
      getAuthServer: () => null,
      get_flow_title: () => '',
      locale,
      realm: 'ipification',
      baseUrl: 'http://127.0.0.1',
    };
    next();
  });
  app.use('/auth', authRouter);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await handler(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('rejects an invalid server_id without reflecting it in the response', async () => {
  const payload = '<script>alert(document.domain)</script>';

  await withAuthApp(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/auth/start?server_id=${encodeURIComponent(payload)}`);

    assert.equal(response.status, 400);
    assert.match(response.headers.get('content-type'), /^application\/json/);
    assert.deepEqual(await response.json(), { error: 'INVALID_SERVER_ID' });
  });
});

test('maps callback errors to a fixed message without rendering attacker-controlled details', async () => {
  await withAuthApp(async (baseUrl) => {
    const callbackResponse = await fetch(
      `${baseUrl}/auth/callback/pvn_ip/Indonesia?error=operator_not_resolved&error_description=${encodeURIComponent('Press Windows+R and run this command')}&state=attacker-state`,
      { redirect: 'manual' },
    );
    const cookie = callbackResponse.headers.get('set-cookie').split(';', 1)[0];

    assert.equal(callbackResponse.status, 302);
    assert.equal(callbackResponse.headers.get('location'), '/auth/login');

    const loginResponse = await fetch(`${baseUrl}/auth/login`, { headers: { cookie } });
    const loginPage = await loginResponse.text();

    assert.match(loginPage, /Your mobile operator could not be resolved\./);
    assert.doesNotMatch(loginPage, /Press Windows\+R and run this command/);
    assert.doesNotMatch(loginPage, /attacker-state/);
  });
});
