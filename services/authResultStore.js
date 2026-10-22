const dataStore = require('../lib/data_store');
const { delay } = require('../utils/helpers');
const { MAX_RETRY_ATTEMPTS, RETRY_DELAY_MS } = require('../utils/constants');

function createAuthResultStore({ dataStore, delay }) {
  async function saveResult(state, response, userInfo) {
    // Completion consumes the formatted response; S2S consumes raw userinfo.
    await dataStore.set(state, response);
    await dataStore.set(`${state}-user-info`, userInfo);
  }

  async function waitForResult(state) {
    let response;
    let attempts = 0;

    while (attempts <= MAX_RETRY_ATTEMPTS) {
      response = await dataStore.get(state || '');
      if (response) break;
      await delay(RETRY_DELAY_MS);
      attempts += 1;
    }

    return response;
  }

  async function getUserInfo(state) {
    return dataStore.get(`${state}-user-info`);
  }

  return { saveResult, waitForResult, getUserInfo };
}

module.exports = {
  ...createAuthResultStore({ dataStore, delay }),
  createAuthResultStore,
};
