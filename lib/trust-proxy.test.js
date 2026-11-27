// Pure-function tests: no database, no Express.
const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_HOPS, MAX_HOPS, parseTrustProxyHops } = require('./trust-proxy');

test('trust proxy: not set means three hops (Render), and nothing is reported', () => {
  for (const value of [undefined, null, '']) {
    assert.deepEqual(parseTrustProxyHops(value), { hops: 3, ignored: false });
  }
  assert.equal(DEFAULT_HOPS, 3);
});

test('trust proxy: whole numbers from 1 to the maximum are used', () => {
  assert.deepEqual(parseTrustProxyHops('1'), { hops: 1, ignored: false });
  assert.deepEqual(parseTrustProxyHops('2'), { hops: 2, ignored: false });
  assert.deepEqual(parseTrustProxyHops(' 3 '), { hops: 3, ignored: false });
  assert.deepEqual(parseTrustProxyHops(String(MAX_HOPS)), { hops: MAX_HOPS, ignored: false });
});

test('trust proxy: anything else falls back to the default of three hops and is reported as ignored', () => {
  for (const value of ['0', '-1', '1.5', 'abc', 'true', 'false', '2 hops', '1e1', '011', String(MAX_HOPS + 1), '100', '99999999999', ' ', '+2', {}, [], 2, true]) {
    assert.deepEqual(parseTrustProxyHops(value), { hops: 3, ignored: true }, JSON.stringify(value));
  }
});

test('trust proxy: never returns "trust everything" (true) or a non-integer', () => {
  for (const value of ['true', 'TRUE', '1.0', 'Infinity', 'NaN']) {
    const { hops } = parseTrustProxyHops(value);
    assert.ok(Number.isInteger(hops) && hops >= 1 && hops <= MAX_HOPS, value);
  }
});
