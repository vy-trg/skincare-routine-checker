// Pure test with a fake req/res: no Express, no database.
const test = require('node:test');
const assert = require('node:assert/strict');
const requireLogin = require('./require-login');

function run(req) {
  const result = { nextCalled: false, status: null, json: null, redirect: null };
  const res = {
    status(code) {
      result.status = code;
      return res;
    },
    json(body) {
      result.json = body;
      return res;
    },
    redirect(location) {
      result.redirect = location;
      return res;
    },
  };
  requireLogin(req, res, () => {
    result.nextCalled = true;
  });
  return result;
}

const loggedIn = (originalUrl) => ({ isAuthenticated: () => true, originalUrl });
const anonymous = (originalUrl) => ({ isAuthenticated: () => false, originalUrl });

test('requireLogin: a logged-in user passes through, on pages and on /api', () => {
  for (const url of ['/products', '/api/me', '/']) {
    const result = run(loggedIn(url));
    assert.equal(result.nextCalled, true, url);
    assert.equal(result.redirect, null);
    assert.equal(result.status, null);
  }
});

test('requireLogin: an anonymous page request is redirected to /login', () => {
  for (const url of ['/products', '/routines/am', '/products?x=1', '/apiary', '/api-docs']) {
    const result = run(anonymous(url));
    assert.equal(result.nextCalled, false, url);
    assert.equal(result.redirect, '/login', url);
    assert.equal(result.status, null, url);
  }
});

test('requireLogin: an anonymous /api request gets 401 JSON, not a redirect', () => {
  for (const url of ['/api', '/api/me', '/api/products/3?x=1']) {
    const result = run(anonymous(url));
    assert.equal(result.nextCalled, false, url);
    assert.equal(result.status, 401, url);
    assert.deepEqual(result.json, { error: 'Log in required.' }, url);
    assert.equal(result.redirect, null, url);
  }
});

test('requireLogin: a missing isAuthenticated or missing url counts as not logged in', () => {
  const noMethod = run({ originalUrl: '/products' });
  assert.equal(noMethod.nextCalled, false);
  assert.equal(noMethod.redirect, '/login');

  const noUrl = run({ isAuthenticated: () => false });
  assert.equal(noUrl.nextCalled, false);
  assert.equal(noUrl.redirect, '/login');
});
