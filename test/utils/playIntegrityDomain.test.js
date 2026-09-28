const test = require('node:test');
const assert = require('node:assert/strict');
const { isPlayIntegrityVerificationDomain } = require('../../utils/playIntegrityDomain');

test('matches only the configured full hostname', () => {
  const domains = ['showcase.example.com', 'Demo.Example.com'];

  assert.equal(isPlayIntegrityVerificationDomain('showcase.example.com', domains), true);
  assert.equal(isPlayIntegrityVerificationDomain('demo.example.com', domains), true);
  assert.equal(isPlayIntegrityVerificationDomain('www.showcase.example.com', domains), false);
  assert.equal(isPlayIntegrityVerificationDomain('example.com', domains), false);
  assert.equal(isPlayIntegrityVerificationDomain('https://showcase.example.com', domains), false);
});

test('does not enable verification for an invalid or missing domain list', () => {
  assert.equal(isPlayIntegrityVerificationDomain('showcase.example.com', undefined), false);
  assert.equal(isPlayIntegrityVerificationDomain('showcase.example.com', []), false);
  assert.equal(isPlayIntegrityVerificationDomain('', ['showcase.example.com']), false);
});
