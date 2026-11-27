// No database, no HTTP: the real csrf-csrf middleware is called with fake req/res objects.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  GUEST_IDENTIFIER, EXPIRED_MESSAGE, deriveCsrfSecret, sessionIdentifier, tokenFromRequest,
  csrfCookie, isCsrfError, csrfFailure, createCsrf,
} = require('./csrf');

const SECRET = 'a-test-session-secret';

// ---------------------------------------------------------------- pure pieces

test('deriveCsrfSecret: stable, different from the session secret, and needs a secret', () => {
  const a = deriveCsrfSecret(SECRET);
  assert.equal(a, deriveCsrfSecret(SECRET));
  assert.notEqual(a, SECRET);
  assert.notEqual(a, deriveCsrfSecret('another-secret'));
  for (const bad of [undefined, null, '', 42, {}]) assert.throws(() => deriveCsrfSecret(bad));
});

test('sessionIdentifier: a constant for guests, the session id for a logged-in user', () => {
  assert.equal(sessionIdentifier({}), GUEST_IDENTIFIER);
  assert.equal(sessionIdentifier({ session: { id: 'abc' } }), GUEST_IDENTIFIER); // a session without a user
  assert.equal(sessionIdentifier({ user: { id: 1 } }), GUEST_IDENTIFIER);
  assert.equal(sessionIdentifier({ user: { id: 1 }, session: { id: '' } }), GUEST_IDENTIFIER);
  const a = sessionIdentifier({ user: { id: 1 }, session: { id: 'sess-A' } });
  const b = sessionIdentifier({ user: { id: 1 }, session: { id: 'sess-B' } });
  assert.notEqual(a, b);
  assert.notEqual(a, GUEST_IDENTIFIER);
});

test('tokenFromRequest: reads the _csrf form field only', () => {
  assert.equal(tokenFromRequest({ body: { _csrf: 'tok' } }), 'tok');
  assert.equal(tokenFromRequest({ body: {}, headers: { 'x-csrf-token': 'h' }, cookies: { csrf: 'c' } }), undefined);
  assert.equal(tokenFromRequest({ body: { _csrf: ['a', 'b'] } }), undefined); // repeated field
  assert.equal(tokenFromRequest({ body: { _csrf: { a: 1 } } }), undefined);
  assert.equal(tokenFromRequest({}), undefined);
  assert.equal(tokenFromRequest({ body: null }), undefined);
});

test('csrfCookie: __Host- and secure in production; plain name and not secure locally; always httpOnly and lax', () => {
  const prod = csrfCookie(true);
  assert.equal(prod.cookieName, '__Host-csrf');
  assert.deepEqual(prod.cookieOptions, { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 });
  assert.equal(prod.cookieOptions.domain, undefined); // a __Host- cookie must not have a domain
  const dev = csrfCookie(false);
  assert.equal(dev.cookieName, 'csrf');
  assert.equal(dev.cookieOptions.secure, false);
  assert.equal(dev.cookieOptions.httpOnly, true);
  assert.equal(dev.cookieOptions.sameSite, 'lax');
});

test('isCsrfError: only the csrf-csrf error code', () => {
  assert.equal(isCsrfError({ code: 'EBADCSRFTOKEN' }), true);
  for (const e of [null, undefined, new Error('x'), { code: 'EOTHER' }, 'EBADCSRFTOKEN']) assert.equal(isCsrfError(e), false);
});

test('csrfFailure: login and register keep what was typed, never the password; other forms get the error page', () => {
  const login = csrfFailure({ path: '/login', body: { email: '  Vy@Example.org ', password: 'secret-pass' } });
  assert.equal(login.view, 'login');
  assert.equal(login.locals.values.email, 'vy@example.org');
  assert.equal(login.locals.errors.form, EXPIRED_MESSAGE);
  assert.doesNotMatch(JSON.stringify(login.locals), /secret-pass/);

  const reg = csrfFailure({ path: '/Register/', body: { email: 'New@Example.org', display_name: 'Vy', skin_type: 'dry', password: 'secret-pass' } });
  assert.equal(reg.view, 'register');
  assert.equal(reg.locals.values.email, 'new@example.org');
  assert.equal(reg.locals.values.display_name, 'Vy');
  assert.ok(Array.isArray(reg.locals.skinTypes));
  assert.doesNotMatch(JSON.stringify(reg.locals), /secret-pass/);

  for (const path of ['/logout', '/products', '/products/3/delete', '/routines/am/items', '/nope', undefined]) {
    const other = csrfFailure({ path, body: { name: 'x', ingredients: 'y' } });
    assert.equal(other.view, 'error', String(path));
    assert.match(other.locals.message, /reload the page/);
  }
  assert.match(EXPIRED_MESSAGE, /This form expired\. Please reload the page and try again\./);
  assert.doesNotMatch(EXPIRED_MESSAGE, /\b(invalid|wrong|fault|mistake|failed)\b/i);
});

test('csrfFailure: copes with a missing body', () => {
  assert.equal(csrfFailure({ path: '/login' }).locals.values.email, '');
  assert.equal(csrfFailure({ path: '/register' }).view, 'register');
});

// ---------------------------------------------------------------- the real check, with fake req/res

function setup(options = {}) {
  return createCsrf({ sessionSecret: SECRET, isProduction: false, ...options });
}

function fakeRes() {
  const res = { locals: {}, cookies: [], cookie(name, value, opts) { res.cookies.push({ name, value, opts }); return res; } };
  return res;
}

// Runs a request through attachToken and protection, like app.js does. Resolves with what next() got.
function run(csrf, req) {
  req.cookies = req.cookies || {};
  req.body = req.body || {};
  const res = fakeRes();
  let outcome;
  csrf.attachToken(req, res, () => {});
  csrf.protection(req, res, (err) => { outcome = err === undefined ? 'passed' : err; });
  return { res, outcome };
}

// Like a browser: GET a page (asks for a token), then returns the cookie and the form token.
function getFormToken(csrf, who) {
  const req = { method: 'GET', ...who };
  const { res, outcome } = run(csrf, req);
  assert.equal(outcome, 'passed');
  const token = res.locals.csrfToken();
  const cookie = res.cookies.at(-1);
  assert.equal(cookie.name, csrf.cookieName);
  assert.equal(cookie.value, token);
  return token;
}

const guest = () => ({});
const userSession = (id) => ({ user: { id: 7 }, session: { id } });

function post(csrf, who, { cookie, field }) {
  return run(csrf, {
    method: 'POST', ...who,
    cookies: cookie === undefined ? {} : { [csrf.cookieName]: cookie },
    body: field === undefined ? { email: 'a@b.co' } : { email: 'a@b.co', _csrf: field },
  }).outcome;
}

const refused = (outcome) => isCsrfError(outcome) && outcome.statusCode === 403;

test('csrf: a POST with the token from its own form and cookie is accepted (guest and user)', () => {
  const csrf = setup();
  const g = getFormToken(csrf, guest());
  assert.equal(post(csrf, guest(), { cookie: g, field: g }), 'passed');
  const u = getFormToken(csrf, userSession('sess-A'));
  assert.equal(post(csrf, userSession('sess-A'), { cookie: u, field: u }), 'passed');
});

test('csrf: GET, HEAD and OPTIONS are not checked', () => {
  const csrf = setup();
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    assert.equal(run(csrf, { method }).outcome, 'passed', method);
  }
});

test('csrf: a POST WITHOUT a token is refused (no field, no cookie, neither)', () => {
  const csrf = setup();
  const t = getFormToken(csrf, guest());
  assert.ok(refused(post(csrf, guest(), { cookie: t, field: undefined })), 'cookie but no field');
  assert.ok(refused(post(csrf, guest(), { cookie: undefined, field: t })), 'field but no cookie');
  assert.ok(refused(post(csrf, guest(), { cookie: undefined, field: undefined })), 'neither');
  assert.ok(refused(post(csrf, guest(), { cookie: t, field: '' })), 'empty field');
});

test('csrf: a POST with a WRONG token is refused', () => {
  const csrf = setup();
  const t = getFormToken(csrf, guest());
  const [hmac, random] = t.split('.');
  const wrong = [
    'not-a-token',
    `${hmac}.${random}x`, // random part changed
    `${'0'.repeat(hmac.length)}.${random}`, // hmac changed
    `${hmac}`, // no random part
    `.${random}`,
  ];
  for (const bad of wrong) {
    assert.ok(refused(post(csrf, guest(), { cookie: bad, field: bad })), `cookie and field both ${bad.slice(0, 12)}`);
    assert.ok(refused(post(csrf, guest(), { cookie: t, field: bad })), `only the field is ${bad.slice(0, 12)}`);
  }
  // field and cookie each valid, but they are two different tokens
  const other = getFormToken(setup(), guest());
  assert.ok(refused(post(csrf, guest(), { cookie: t, field: other })), 'a valid token from elsewhere in the field');
});

test('csrf: a token from ANOTHER SESSION is refused', () => {
  const csrf = setup();
  const a = getFormToken(csrf, userSession('sess-A'));
  // user B (or the same user in another session) cannot use A's token, even with A's cookie too
  assert.ok(refused(post(csrf, userSession('sess-B'), { cookie: a, field: a })));
  // and A's token does not work for a guest either
  assert.ok(refused(post(csrf, guest(), { cookie: a, field: a })));
  // a guest's token does not work for a logged-in user
  const g = getFormToken(csrf, guest());
  assert.ok(refused(post(csrf, userSession('sess-A'), { cookie: g, field: g })));
});

test('csrf: a token signed with another secret (another deployment) is refused', () => {
  const t = getFormToken(setup({ sessionSecret: 'secret-one' }), guest());
  assert.ok(refused(post(setup({ sessionSecret: 'secret-two' }), guest(), { cookie: t, field: t })));
});

test('csrf: login and logout start a new session, so the old token stops working and a new one is issued', () => {
  const csrf = setup();
  // 1. guest opens /login and gets a token
  const guestToken = getFormToken(csrf, guest());
  assert.equal(post(csrf, guest(), { cookie: guestToken, field: guestToken }), 'passed'); // POST /login works
  // 2. after login the user has a new session: the guest token is refused for it
  assert.ok(refused(post(csrf, userSession('after-login'), { cookie: guestToken, field: guestToken })));
  // 3. the next page the user opens still carries the guest cookie; it must be replaced by a valid token
  const req = { method: 'GET', ...userSession('after-login'), cookies: { [csrf.cookieName]: guestToken } };
  const { res } = run(csrf, req);
  const userToken = res.locals.csrfToken();
  assert.notEqual(userToken, guestToken);
  assert.equal(post(csrf, userSession('after-login'), { cookie: userToken, field: userToken }), 'passed'); // POST /logout works
  // 4. after logout the user is a guest again with a new cookie
  const again = run(csrf, { method: 'GET', ...guest(), cookies: { [csrf.cookieName]: userToken } });
  const guestAgain = again.res.locals.csrfToken();
  assert.equal(post(csrf, guest(), { cookie: guestAgain, field: guestAgain }), 'passed');
  assert.ok(refused(post(csrf, guest(), { cookie: userToken, field: userToken })));
});

test('csrf: several tabs share one valid cookie, so every open form keeps working', () => {
  const csrf = setup();
  const first = getFormToken(csrf, guest());
  const second = run(csrf, { method: 'GET', cookies: { [csrf.cookieName]: first } }).res.locals.csrfToken();
  assert.equal(second, first);
  assert.equal(post(csrf, guest(), { cookie: first, field: first }), 'passed'); // tab 1's form
  assert.equal(post(csrf, guest(), { cookie: first, field: second }), 'passed'); // tab 2's form
});

// ---------------------------------------------------------------- views get the token

test('attachToken: csrfToken() is made once per request, and no cookie is set unless a template asks', () => {
  const csrf = setup();
  const idle = run(csrf, { method: 'GET' });
  assert.equal(idle.res.cookies.length, 0); // a page without a form sets no cookie
  const busy = run(csrf, { method: 'GET' });
  const a = busy.res.locals.csrfToken();
  const b = busy.res.locals.csrfToken();
  assert.equal(a, b);
  assert.equal(busy.res.cookies.length, 1); // two forms on one page, one Set-Cookie
});

test('attachToken: the token is available when the check fails, so the error page forms work', () => {
  const csrf = setup();
  const { res, outcome } = run(csrf, { method: 'POST' });
  assert.ok(refused(outcome));
  assert.equal(typeof res.locals.csrfToken, 'function');
  assert.ok(res.locals.csrfToken().includes('.'));
});

// ---------------------------------------------------------------- the error handler

function fakeRenderRes() {
  const sent = {};
  const res = {
    headersSent: false, locals: {},
    status(code) { sent.status = code; return res; },
    render(view, locals) { sent.view = view; sent.locals = locals; return res; },
  };
  return { res, sent };
}

test('error handler: a refused POST /login gets 403 with the form, the email kept and no password', () => {
  const csrf = setup();
  const { res, sent } = fakeRenderRes();
  csrf.errorHandler({ code: 'EBADCSRFTOKEN' }, { path: '/login', body: { email: 'Vy@Example.org', password: 'secret-pass' } }, res, () => assert.fail('next called'));
  assert.equal(sent.status, 403);
  assert.equal(sent.view, 'login');
  assert.equal(sent.locals.values.email, 'vy@example.org');
  assert.equal(sent.locals.errors.form, EXPIRED_MESSAGE);
  assert.doesNotMatch(JSON.stringify(sent), /secret-pass/);
});

test('error handler: other forms get 403 with the general page', () => {
  const csrf = setup();
  const { res, sent } = fakeRenderRes();
  csrf.errorHandler({ code: 'EBADCSRFTOKEN' }, { path: '/products/4/delete', body: {} }, res, () => assert.fail('next called'));
  assert.equal(sent.status, 403);
  assert.equal(sent.view, 'error');
});

test('error handler: other errors, and errors after the headers were sent, are passed on', () => {
  const csrf = setup();
  const boom = new Error('boom');
  let got;
  csrf.errorHandler(boom, { path: '/login' }, fakeRenderRes().res, (e) => { got = e; });
  assert.equal(got, boom);

  const late = fakeRenderRes();
  late.res.headersSent = true;
  const csrfErr = { code: 'EBADCSRFTOKEN' };
  csrf.errorHandler(csrfErr, { path: '/login' }, late.res, (e) => { got = e; });
  assert.equal(got, csrfErr);
  assert.equal(late.sent.status, undefined);
});
