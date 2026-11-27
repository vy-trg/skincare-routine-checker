// No database. The first part tests the pure pieces with fakes. The second part puts the REAL
// limiters and the REAL login response (auth/login-response.js) in a tiny Express app whose
// "authentication" is a stub, so it proves what is counted without Passport or a pool.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { loginResponse } = require('./login-response');
const { normalizeEmail } = require('../lib/validation');
const { RATE_LIMIT, waitMinutes, limitMessage, createLimitHandler, createAuthLimiters } = require('./rate-limit');

// ---------------------------------------------------------------- pure pieces

test('rate limit: 10 attempts per 15 minutes', () => {
  assert.equal(RATE_LIMIT.limit, 10);
  assert.equal(RATE_LIMIT.windowMs, 15 * 60 * 1000);
});

test('waitMinutes: rounds up, never below 1 and never above the window', () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);
  const at = (ms) => new Date(now + ms);
  assert.equal(waitMinutes(at(12 * 60000), now), 12);
  assert.equal(waitMinutes(at(12 * 60000 + 1), now), 13);
  assert.equal(waitMinutes(at(1), now), 1);
  assert.equal(waitMinutes(at(0), now), 1);
  assert.equal(waitMinutes(at(-5000), now), 1); // reset time already passed
  assert.equal(waitMinutes(at(15 * 60000), now), 15);
  assert.equal(waitMinutes(at(99 * 60000), now), 15); // a wrong clock must not promise hours
});

test('waitMinutes: without a usable reset time it says the whole window', () => {
  for (const value of [undefined, null, 'soon', 42, {}, new Date('nope')]) {
    assert.equal(waitMinutes(value, Date.now()), 15, String(value));
  }
});

test('limitMessage: says how long to wait, in singular and plural, without blaming', () => {
  assert.equal(limitMessage(1), 'Too many attempts. Please wait about 1 minute and try again.');
  assert.equal(limitMessage(12), 'Too many attempts. Please wait about 12 minutes and try again.');
  assert.doesNotMatch(limitMessage(5), /\b(you|your|invalid|wrong|fault)\b/i);
});

function fakeRes() {
  const sent = {};
  return {
    sent,
    status(code) { sent.status = code; return this; },
    render(view, locals) { sent.view = view; sent.locals = locals; return this; },
  };
}

test('limit handler: answers 429 with the login form, the email kept and the wait time', () => {
  const logged = [];
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);
  const handler = createLimitHandler({
    view: 'login',
    route: 'POST /login',
    buildLocals: (req, message) => ({ errors: { form: message }, values: { email: normalizeEmail(req.body.email) } }),
    log: (line) => logged.push(line),
    now: () => now,
  });
  const res = fakeRes();
  handler({ ip: '203.0.113.9', body: { email: '  Vy@Example.org ' }, rateLimit: { used: 11, limit: 10, resetTime: new Date(now + 7 * 60000) } }, res);
  assert.equal(res.sent.status, 429);
  assert.equal(res.sent.view, 'login');
  assert.equal(res.sent.locals.errors.form, 'Too many attempts. Please wait about 7 minutes and try again.');
  assert.equal(res.sent.locals.values.email, 'vy@example.org');
  assert.deepEqual(logged, ['Rate limit reached for POST /login from 203.0.113.9']);
});

test('limit handler: logs once when the block starts, not for every blocked request', () => {
  const logged = [];
  const handler = createLimitHandler({ view: 'login', route: 'POST /login', buildLocals: () => ({}), log: (l) => logged.push(l) });
  for (const used of [11, 12, 13, 50]) handler({ ip: 'x', rateLimit: { used, limit: 10 } }, fakeRes());
  assert.equal(logged.length, 1);
});

test('limit handler: copes with a missing rateLimit object and a missing body', () => {
  const handler = createLimitHandler({ view: 'login', route: 'POST /login', buildLocals: () => ({}), log: () => {} });
  const res = fakeRes();
  handler({}, res);
  assert.equal(res.sent.status, 429);
});

// ---------------------------------------------------------------- the real limiters in a tiny app

const views = path.join(__dirname, '..', 'views');

// A copy of the two routes with Passport replaced by a stub: password "right" logs in, anything else fails.
// The failure and success responses are the real ones from auth/login-response.js.
async function startApp({ trustProxy } = {}) {
  const { loginLimiter, registerLimiter } = createAuthLimiters({ log: () => {} });
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', views);
  if (trustProxy !== undefined) app.set('trust proxy', trustProxy);
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => { req.login = (user, cb) => cb(); next(); });

  app.post('/login', loginLimiter, (req, res, next) => {
    const email = normalizeEmail(req.body.email);
    const fakeAuthenticate = (callback) => callback(null, req.body.password === 'right' ? { id: 1 } : false);
    fakeAuthenticate(loginResponse(req, res, next, email));
  });

  app.post('/register', registerLimiter, (req, res) => {
    if (req.body.password === 'good-password') return res.redirect('/');
    res.status(400).send('validation failed');
  });

  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (url, fields, headers = {}) =>
    fetch(base + url, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
      body: new URLSearchParams(fields).toString(),
    });
  return { post, close: () => new Promise((resolve) => server.close(resolve)) };
}

async function withApp(options, fn) {
  const app = await startApp(options);
  try { await fn(app); } finally { await app.close(); }
}

const wrong = { email: 'Vy@Example.org', password: 'nope' };
const right = { email: 'Vy@Example.org', password: 'right' };

test('login: a failed login answers 401 with the form, never a redirect', async () => {
  await withApp({}, async ({ post }) => {
    const res = await post('/login', wrong);
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('location'), null);
    assert.match(await res.text(), /Incorrect email or password\./);
  });
});

test('login: a successful login answers with a redirect (below 400)', async () => {
  await withApp({}, async ({ post }) => {
    const res = await post('/login', right);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/');
  });
});

test('login: failed logins ARE counted: the 11th is blocked with 429, the email kept and a wait time', async () => {
  await withApp({}, async ({ post }) => {
    for (let i = 1; i <= 10; i++) {
      assert.equal((await post('/login', wrong)).status, 401, `attempt ${i}`);
    }
    const blocked = await post('/login', wrong);
    assert.equal(blocked.status, 429);
    const retryAfter = Number(blocked.headers.get('retry-after'));
    assert.ok(retryAfter >= 1 && retryAfter <= 900, `Retry-After ${retryAfter}`);
    const html = await blocked.text();
    assert.match(html, /Too many attempts\. Please wait about \d+ minutes? and try again\./);
    assert.match(html, /value="vy@example\.org"/);
    assert.doesNotMatch(html, /nope/); // the password is never sent back
  });
});

test('login: successful logins are NOT counted', async () => {
  await withApp({}, async ({ post }) => {
    for (let i = 1; i <= 15; i++) {
      assert.equal((await post('/login', right)).status, 302, `login ${i}`);
    }
    // The 15 successes used none of the budget: all 10 failures are still answered normally.
    for (let i = 1; i <= 10; i++) {
      assert.equal((await post('/login', wrong)).status, 401, `failure ${i}`);
    }
    assert.equal((await post('/login', wrong)).status, 429);
  });
});

test('login: after 10 failures even the right password has to wait', async () => {
  await withApp({}, async ({ post }) => {
    for (let i = 0; i < 10; i++) await post('/login', wrong);
    assert.equal((await post('/login', right)).status, 429);
  });
});

test('register: every attempt is counted, successful ones too', async () => {
  await withApp({}, async ({ post }) => {
    const fields = { email: 'New@Example.org', display_name: 'Vy', skin_type: 'dry', password: 'good-password' };
    for (let i = 1; i <= 10; i++) {
      assert.equal((await post('/register', fields)).status, 302, `registration ${i}`);
    }
    const blocked = await post('/register', fields);
    assert.equal(blocked.status, 429);
    const html = await blocked.text();
    assert.match(html, /Too many attempts\. Please wait about \d+ minutes? and try again\./);
    assert.match(html, /value="new@example\.org"/);
    assert.match(html, /value="Vy"/);
    assert.doesNotMatch(html, /good-password/);
  });
});

test('login and register have separate counters', async () => {
  await withApp({}, async ({ post }) => {
    for (let i = 0; i < 11; i++) await post('/login', wrong);
    assert.equal((await post('/login', wrong)).status, 429);
    assert.equal((await post('/register', { email: 'a@b.co', password: 'good-password' })).status, 302);
  });
});

// ---------------------------------------------------------------- which IP is counted

test('proxy hops = 1: names a visitor invents on the left of X-Forwarded-For are ignored', async () => {
  await withApp({ trustProxy: 1 }, async ({ post }) => {
    // The proxy appends the address it saw (198.51.100.7) on the right; a visitor can only write on the left.
    for (let i = 1; i <= 10; i++) {
      const res = await post('/login', wrong, { 'X-Forwarded-For': `spoof-${i}, 198.51.100.7` });
      assert.equal(res.status, 401, `attempt ${i}`);
    }
    const res = await post('/login', wrong, { 'X-Forwarded-For': 'spoof-11, 198.51.100.7' });
    assert.equal(res.status, 429, 'a new made-up address must not give a fresh budget');
  });
});

test('proxy hops = 2 (CDN then load balancer): each visitor gets their own budget', async () => {
  await withApp({ trustProxy: 2 }, async ({ post }) => {
    const visitorA = { 'X-Forwarded-For': '203.0.113.5, 198.51.100.7' }; // visitor, CDN
    const visitorB = { 'X-Forwarded-For': '203.0.113.6, 198.51.100.7' }; // another visitor, same CDN
    for (let i = 0; i < 11; i++) await post('/login', wrong, visitorA);
    assert.equal((await post('/login', wrong, visitorA)).status, 429);
    assert.equal((await post('/login', wrong, visitorB)).status, 401, 'B must not be blocked because of A');
  });
});

test('proxy hops set too low: everyone behind the same proxy shares ONE budget', async () => {
  // This is the lock-everyone-out risk that TRUST_PROXY_HOPS exists to fix.
  await withApp({ trustProxy: 1 }, async ({ post }) => {
    const visitorA = { 'X-Forwarded-For': '203.0.113.5, 198.51.100.7' };
    const visitorB = { 'X-Forwarded-For': '203.0.113.6, 198.51.100.7' };
    for (let i = 0; i < 11; i++) await post('/login', wrong, visitorA);
    assert.equal((await post('/login', wrong, visitorB)).status, 429);
  });
});
