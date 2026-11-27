// app.js cannot be loaded in a test (it needs the database pool), so this reads its text and checks
// the order of the lines that matter for CSRF. Order is the whole point: see the comment in app.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const at = (needle) => {
  const first = source.indexOf(needle);
  assert.notEqual(first, -1, `app.js no longer contains: ${needle}`);
  assert.equal(source.indexOf(needle, first + 1), -1, `app.js contains more than one: ${needle}`);
  return first;
};

test('app.js: /healthz and /api come BEFORE the session and the CSRF check, so they are not affected', () => {
  const csrfCheck = at('app.use(csrf.protection);');
  assert.ok(at("app.get('/healthz'") < csrfCheck);
  assert.ok(at("app.use('/api'") < at('session({'));
  assert.ok(at("app.use('/api'") < csrfCheck);
});

test('app.js: the CSRF check comes after the session and passport, and before every route that posts', () => {
  const csrfCheck = at('app.use(csrf.protection);');
  assert.ok(at('app.use(passport.session());') < csrfCheck);
  assert.ok(at('app.use(cookieParser());') < at('app.use(csrf.attachToken);'));
  assert.ok(at('app.use(csrf.attachToken);') < csrfCheck, 'the token function must exist even when the check fails');
  assert.ok(at('app.use(express.urlencoded') < csrfCheck, 'the form body must be parsed first');
  assert.ok(csrfCheck < at("app.use(require('./routes/auth'));"), 'before the rate limiters in routes/auth.js');
  assert.ok(csrfCheck < at("app.use('/products'"));
  assert.ok(csrfCheck < at("'/routines',"));
});

test('app.js: the CSRF error handler comes before the general error handler', () => {
  assert.ok(at('app.use(csrf.errorHandler);') < at('app.use((err, req, res, next) => {'));
});
