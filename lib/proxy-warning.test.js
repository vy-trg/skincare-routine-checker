// Pure-function tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const { isProxyAddress, proxyChainWarning, parseIp } = require('./proxy-warning');

test('private IPv4 ranges are proxy addresses, including their edges', () => {
  for (const ip of ['10.0.0.0', '10.24.225.5', '10.255.255.255', '172.16.0.1', '172.31.255.255', '192.168.0.1', '192.168.255.255']) {
    assert.equal(isProxyAddress(ip), true, ip);
  }
});

test('addresses just outside the private ranges are not', () => {
  for (const ip of ['9.255.255.255', '11.0.0.0', '172.15.255.255', '172.32.0.0', '192.167.255.255', '192.169.0.0', '8.8.8.8', '203.0.113.5']) {
    assert.equal(isProxyAddress(ip), false, ip);
  }
});

test('Cloudflare IPv4 and IPv6 ranges are proxy addresses', () => {
  for (const ip of ['173.245.48.1', '173.245.63.255', '104.16.0.1', '104.23.255.255', '162.158.1.1', '162.159.255.255', '172.64.0.1', '2606:4700::1', '2606:4700:ffff::1', '2a06:98c0::1', '2c0f:f248::5']) {
    assert.equal(isProxyAddress(ip), true, ip);
  }
});

test('just outside a Cloudflare range is not', () => {
  for (const ip of ['173.245.64.0', '104.15.255.255', '104.28.0.0', '162.160.0.0', '2606:4701::1', '2607:4700::1']) {
    assert.equal(isProxyAddress(ip), false, ip);
  }
});

test('IPv4 written as IPv6 (::ffff:a.b.c.d, as Node reports it) is handled', () => {
  assert.equal(isProxyAddress('::ffff:10.24.225.5'), true);
  assert.equal(isProxyAddress('::ffff:8.8.8.8'), false);
});

test('ordinary visitors, including IPv6, are not proxy addresses', () => {
  for (const ip of ['198.51.100.7', '2001:db8::1', '2a00:1450:4001::1', '::1', '127.0.0.1']) {
    assert.equal(isProxyAddress(ip), false, ip);
  }
});

test('garbage input is not a proxy address and never throws', () => {
  for (const v of [undefined, null, '', 'abc', '10.0.0', '10.0.0.256', '1:2:3', ':::', '1::2::3', 'g::1', 42, {}, [], '10.0.0.1/8']) {
    assert.equal(isProxyAddress(v), false, String(v));
  }
});

test('parseIp: compressed IPv6 forms', () => {
  assert.equal(parseIp('::').value, 0n);
  assert.equal(parseIp('::1').value, 1n);
  assert.equal(parseIp('1:2:3:4:5:6:7:8').value, parseIp('1:2:3:4:5:6:7:8').value);
  assert.equal(parseIp('1:2:3:4:5:6:7::').version, 6);
});

test('proxyChainWarning: a warning for a proxy address, null for a visitor', () => {
  const warning = proxyChainWarning('10.24.225.5');
  assert.match(warning, /^WARNING: .*10\.24\.225\.5.*TRUST_PROXY_HOPS is probably too low/);
  assert.doesNotMatch(warning, /\n/);
  assert.equal(proxyChainWarning('198.51.100.7'), null);
  assert.equal(proxyChainWarning(undefined), null);
});
