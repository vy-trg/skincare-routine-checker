// TODO(temporary): delete with lib/proxy-diagnostic.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const { describeProxyChain } = require('./proxy-diagnostic');

const parse = (line) => JSON.parse(line.slice(line.indexOf('{')));

test('proxy diagnostic: counts and lists the X-Forwarded-For entries in order', () => {
  const out = parse(describeProxyChain({
    headers: { 'x-forwarded-for': 'fake, 203.0.113.5, 10.24.1.1' },
    ip: '10.24.1.1', ips: ['10.24.1.1'], socket: { remoteAddress: '10.24.225.5' },
  }));
  assert.equal(out.xffCount, 3);
  assert.deepEqual(out.xff, ['fake', '203.0.113.5', '10.24.1.1']);
  assert.equal(out.reqIpsCount, 1);
  assert.equal(out.socket, '10.24.225.5');
  assert.equal(out.reqIp, '10.24.1.1');
});

test('proxy diagnostic: copes with a missing header, ips and socket', () => {
  const out = parse(describeProxyChain({ headers: {} }));
  assert.equal(out.xffCount, 0);
  assert.equal(out.reqIpsCount, 0);
  assert.equal(out.socket, null);
  assert.equal(out.reqIp, null);
});

test('proxy diagnostic: a client-controlled header cannot add log lines or flood the log', () => {
  const line = describeProxyChain({
    headers: { 'x-forwarded-for': 'a\nFAKE LOG LINE,' + 'x'.repeat(500) + ',' + Array(30).fill('1.1.1.1').join(',') },
    socket: {},
  });
  assert.doesNotMatch(line, /[\r\n]/);
  const out = parse(line);
  assert.ok(out.xff.length <= 10);
  assert.ok(out.xff.every((e) => e.length <= 45));
});
