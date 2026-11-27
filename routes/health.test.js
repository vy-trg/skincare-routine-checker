// No database: the handler is tested with a fake res, and once more inside a tiny Express app
// that has nothing else mounted (no session, no pool).
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const healthz = require('./health');

test('healthz: answers 200 with { ok: true } and is never cached', () => {
  const sent = { headers: {}, status: null, body: null };
  const res = {
    set(name, value) { sent.headers[name] = value; return res; },
    status(code) { sent.status = code; return res; },
    json(body) { sent.body = body; return res; },
  };
  healthz({}, res);
  assert.equal(sent.status, 200);
  assert.deepEqual(sent.body, { ok: true });
  assert.equal(sent.headers['Cache-Control'], 'no-store');
});

test('healthz: works over HTTP for GET and HEAD, and only for those', async () => {
  const app = express();
  app.get('/healthz', healthz);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;

    const get = await fetch(`${base}/healthz`);
    assert.equal(get.status, 200);
    assert.match(get.headers.get('content-type'), /application\/json/);
    assert.equal(get.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await get.json(), { ok: true });

    const head = await fetch(`${base}/healthz`, { method: 'HEAD' });
    assert.equal(head.status, 200);

    const post = await fetch(`${base}/healthz`, { method: 'POST' });
    assert.equal(post.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
