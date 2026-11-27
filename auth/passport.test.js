// Tests the LocalStrategy with a fake pool: no database is ever contacted.
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const configurePassport = require('./passport');

// Registers the strategy on a fake passport, feeds it a fake login request and
// resolves with what the strategy decided: success, fail or error.
function runLogin(pool, body) {
  let strategy;
  const fakePassport = {
    use(s) { strategy = s; },
    serializeUser() {},
    deserializeUser() {},
  };
  configurePassport(fakePassport, pool);

  return new Promise((resolve) => {
    strategy.success = (user) => resolve({ outcome: 'success', user });
    strategy.fail = (info) => resolve({ outcome: 'fail', info });
    strategy.error = (err) => resolve({ outcome: 'error', err });
    strategy.authenticate({ body, query: {} });
  });
}

function fakePool(rows) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push(params);
      return { rows };
    },
  };
}

test('non-string passwords fail the login normally, without touching the database or bcrypt', async () => {
  // A repeated form field (password=a&password=b) arrives as an array.
  for (const password of [['correct horse', 'correct horse'], ['x'], 12345678, true, { a: 1 }]) {
    const pool = fakePool([]);
    const result = await runLogin(pool, { email: 'a@b.co', password });
    assert.equal(result.outcome, 'fail', `got ${result.outcome} for ${JSON.stringify(password)}`);
    assert.equal(pool.calls.length, 0);
  }
});

test('unknown email with a string password fails and the email is normalised for the query', async () => {
  const pool = fakePool([]);
  const result = await runLogin(pool, { email: '  Nobody@Example.COM ', password: 'correct horse' });
  assert.equal(result.outcome, 'fail');
  assert.deepEqual(pool.calls, [['nobody@example.com']]);
});

test('wrong password fails and the right password succeeds with only the id', async () => {
  const password_hash = bcrypt.hashSync('correct horse', 4); // low cost: this is only a test
  const wrong = await runLogin(fakePool([{ id: 7, password_hash }]), {
    email: 'a@b.co',
    password: 'battery staple',
  });
  assert.equal(wrong.outcome, 'fail');

  const right = await runLogin(fakePool([{ id: 7, password_hash }]), {
    email: 'a@b.co',
    password: 'correct horse',
  });
  assert.equal(right.outcome, 'success');
  assert.deepEqual(right.user, { id: 7 });
});
