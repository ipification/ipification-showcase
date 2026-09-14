const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const express = require('express');

const ts43Router = require('../../routes/ts43');
const { createTs43AuthRateLimiter } = require('../../middleware/ts43RateLimit');

async function withTs43App(handler) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.locals = {
      clients: [],
      getAuthServer: () => null,
      realm: 'ipification',
    };
    next();
  });
  app.use('/ts43/auth', createTs43AuthRateLimiter({ maxRequests: 2, windowMs: 60_000 }));
  app.use('/ts43', ts43Router);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await handler(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('returns 429 with Retry-After when TS43 authentication exceeds its rate limit', async () => {
  await withTs43App(async (baseUrl) => {
    const request = () => fetch(`${baseUrl}/ts43/auth`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: 'demo-client', login_hint: '+84901234567' }),
    });

    const first = await request();
    assert.equal(first.status, 400);
    assert.equal(first.headers.get('ratelimit-policy'), '2;w=60');
    assert.equal((await request()).status, 400);

    const limited = await request();
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '60');
    assert.deepEqual(await limited.json(), { error: 'RATE_LIMITED' });
  });
});
