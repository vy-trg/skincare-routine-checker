// Tests the query helpers with a FAKE pool: nothing here connects to a database.
// They check what is sent to the pool (the user id is always a parameter, the SQL is scoped by
// user_id, ids are never pasted into the SQL text) and how an empty result is turned into a
// not-found answer. They cannot prove the SQL itself is right: that is the manual test on Neon dev.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createProductStore } = require('./products');
const { createRoutineStore } = require('./routines');

// A fake pool that records every query and answers from a script (one answer per call).
function fakePool(answers = []) {
  const calls = [];
  return {
    calls,
    async query(text, values) {
      calls.push({ text, values });
      return answers.shift() || { rows: [], rowCount: 0 };
    },
  };
}

const compact = (text) => text.replace(/\s+/g, ' ');

// ---------------------------------------------------------------- products

test('products.list: filters by the user id it was given', async () => {
  const pool = fakePool([{ rows: [{ id: 1 }], rowCount: 1 }]);
  const rows = await createProductStore(pool).list(7);
  assert.deepEqual(rows, [{ id: 1 }]);
  assert.equal(pool.calls.length, 1);
  assert.match(compact(pool.calls[0].text), /WHERE user_id = \$1/);
  assert.deepEqual(pool.calls[0].values, [7]);
});

test('products.add: stores the product under the given user id, as parameters', async () => {
  const pool = fakePool([{ rows: [{ id: 3, name: 'Serum' }], rowCount: 1 }]);
  const row = await createProductStore(pool).add(7, { name: 'Serum', ingredients: 'Aqua, Retinol' });
  assert.deepEqual(row, { id: 3, name: 'Serum' });
  assert.deepEqual(pool.calls[0].values, [7, 'Serum', 'Aqua, Retinol']);
  assert.ok(!pool.calls[0].text.includes('Aqua'), 'user text must not be pasted into the SQL');
});

test('products.remove: deletes only WHERE id AND user_id, and says true when a row went', async () => {
  const pool = fakePool([{ rows: [], rowCount: 1 }]);
  assert.equal(await createProductStore(pool).remove(7, 42), true);
  assert.match(compact(pool.calls[0].text), /WHERE id = \$1 AND user_id = \$2/);
  assert.deepEqual(pool.calls[0].values, [42, 7]);
});

test("products.remove: another user's or a missing id deletes nothing and returns false", async () => {
  const pool = fakePool([{ rows: [], rowCount: 0 }]);
  assert.equal(await createProductStore(pool).remove(7, 99), false);
});

test('products: a database error is passed on, not swallowed', async () => {
  const pool = { query: async () => { throw new Error('boom'); } };
  await assert.rejects(createProductStore(pool).list(1), /boom/);
  await assert.rejects(createProductStore(pool).remove(1, 2), /boom/);
});

// ---------------------------------------------------------------- routines

test('routines.getProducts: scoped by user and period, and only joins products of the same user', async () => {
  const pool = fakePool([{ rows: [{ id: 1, name: 'A' }], rowCount: 1 }]);
  const rows = await createRoutineStore(pool).getProducts(7, 'am');
  assert.deepEqual(rows, [{ id: 1, name: 'A' }]);
  const text = compact(pool.calls[0].text);
  assert.match(text, /r\.user_id = \$1 AND r\.period = \$2/);
  assert.match(text, /p\.user_id = r\.user_id/);
  assert.deepEqual(pool.calls[0].values, [7, 'am']);
});

test("routines.addItem: another user's product is 'not-found' and nothing is written", async () => {
  const pool = fakePool([{ rows: [], rowCount: 0 }]); // the ownership check finds nothing
  assert.equal(await createRoutineStore(pool).addItem(7, 'am', 99), 'not-found');
  assert.equal(pool.calls.length, 1, 'no routine row and no routine item may be created');
  assert.match(compact(pool.calls[0].text), /WHERE id = \$1 AND user_id = \$2/);
  assert.deepEqual(pool.calls[0].values, [99, 7]);
});

test("routines.addItem: an owned product is added to the user's own routine", async () => {
  const pool = fakePool([
    { rows: [{ id: 5 }], rowCount: 1 }, // ownership check
    { rows: [{ id: 11 }], rowCount: 1 }, // routine upsert
    { rows: [], rowCount: 1 }, // insert item
  ]);
  assert.equal(await createRoutineStore(pool).addItem(7, 'pm', 5), 'added');
  assert.equal(pool.calls.length, 3);
  assert.deepEqual(pool.calls[1].values, [7, 'pm']); // routine found by (user, period), never by a request id
  assert.deepEqual(pool.calls[2].values, [11, 5]); // the routine id comes from the upsert
});

test("routines.addItem: a product that is already in the routine gives 'already'", async () => {
  const pool = fakePool([
    { rows: [{ id: 5 }], rowCount: 1 },
    { rows: [{ id: 11 }], rowCount: 1 },
    { rows: [], rowCount: 0 }, // ON CONFLICT DO NOTHING
  ]);
  assert.equal(await createRoutineStore(pool).addItem(7, 'am', 5), 'already');
});

test('routines.removeItem: scoped by user and period, true only when a row went', async () => {
  const gone = fakePool([{ rows: [], rowCount: 1 }]);
  assert.equal(await createRoutineStore(gone).removeItem(7, 'am', 5), true);
  assert.match(compact(gone.calls[0].text), /r\.user_id = \$1/);
  assert.deepEqual(gone.calls[0].values, [7, 'am', 5]);

  const none = fakePool([{ rows: [], rowCount: 0 }]);
  assert.equal(await createRoutineStore(none).removeItem(7, 'am', 5), false);
});

test('routines: every query is scoped by user_id and no id is pasted into the SQL', async () => {
  const pool = fakePool([
    { rows: [], rowCount: 0 }, // getProducts
    { rows: [{ id: 5 }], rowCount: 1 }, // addItem: ownership check
    { rows: [{ id: 11 }], rowCount: 1 }, // addItem: routine upsert
    { rows: [], rowCount: 1 }, // addItem: insert item
    { rows: [], rowCount: 1 }, // removeItem
  ]);
  const store = createRoutineStore(pool);
  await store.getProducts(123456, 'am');
  await store.addItem(123456, 'am', 987654);
  await store.removeItem(123456, 'am', 987654);
  assert.equal(pool.calls.length, 5);

  // The item insert (index 3) is the one query addressed by routine id. That id comes from the
  // upsert on (user_id, period), so it is the user's own routine; every other query names user_id.
  pool.calls.forEach((call, index) => {
    if (index !== 3) assert.match(call.text, /user_id/, `query ${index}`);
    assert.ok(!/123456|987654/.test(call.text), `query ${index}: values must be parameters`);
  });
});
