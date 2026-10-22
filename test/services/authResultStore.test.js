const assert = require('node:assert/strict');
const test = require('node:test');
const { createAuthResultStore } = require('../../services/authResultStore');

function fixture({ failWrite = false, hitOnRead } = {}) {
  const values = new Map();
  const operations = [];
  let reads = 0;
  const store = createAuthResultStore({
    dataStore: {
      async set(key, value) {
        operations.push(['set', key, value]);
        if (failWrite) throw new Error('write failed');
        values.set(key, value);
      },
      async get(key) {
        operations.push(['get', key]);
        reads++;
        if (reads === hitOnRead) values.set(key, { state: key });
        return values.get(key);
      },
    },
    delay: async ms => { operations.push(['delay', ms]); },
  });
  return { store, values, operations };
}

test('stores formatted result then raw userinfo without changing or consuming them', async () => {
  const { store, values, operations } = fixture();
  await store.saveResult('s', { userInfo: '<pre>phone</pre>' }, { phone: '+12025550123' });
  assert.deepEqual(operations, [
    ['set', 's', { userInfo: '<pre>phone</pre>' }],
    ['set', 's-user-info', { phone: '+12025550123' }],
  ]);
  assert.deepEqual(values.get('s'), { userInfo: '<pre>phone</pre>' });
  assert.deepEqual(await store.getUserInfo('s'), { phone: '+12025550123' });
  assert.deepEqual(await store.getUserInfo('s'), { phone: '+12025550123' });
});

test('does not write userinfo after the first result write fails', async () => {
  const { store, operations } = fixture({ failWrite: true });
  await assert.rejects(store.saveResult('s', { state: 's' }, {}), /write failed/);
  assert.deepEqual(operations, [['set', 's', { state: 's' }]]);
});

test('returns an immediate result without sleeping', async () => {
  const { store, values, operations } = fixture();
  values.set('s', { state: 's' });
  assert.deepEqual(await store.waitForResult('s'), { state: 's' });
  assert.deepEqual(operations, [['get', 's']]);
});

test('returns a delayed result after exactly two sleeps when read three succeeds', async () => {
  const { store, operations } = fixture({ hitOnRead: 3 });
  assert.deepEqual(await store.waitForResult('s'), { state: 's' });
  assert.deepEqual(operations, [['get', 's'], ['delay', 1000], ['get', 's'], ['delay', 1000], ['get', 's']]);
});

for (const state of ['missing', undefined]) {
  test(`preserves five reads and five sleeps for missing result (${state})`, async () => {
    const { store, operations } = fixture();
    assert.equal(await store.waitForResult(state), undefined);
    assert.deepEqual(operations, Array.from({ length: 5 }, () => [['get', state || ''], ['delay', 1000]]).flat());
  });
}

test('propagates cache read errors without sleeping or retrying', async () => {
  const store = createAuthResultStore({ dataStore: { get: async () => { throw new Error('read failed'); } }, delay: async () => { assert.fail('unexpected delay'); } });
  await assert.rejects(store.waitForResult('s'), /read failed/);
  await assert.rejects(store.getUserInfo('s'), /read failed/);
});
