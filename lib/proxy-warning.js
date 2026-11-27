// Detects when req.ip looks like one of OUR proxies instead of a visitor, which means
// TRUST_PROXY_HOPS is probably too low for the current proxy chain (see lib/trust-proxy.js).
// Then the rate limits are shared by everybody behind that proxy.
//
// "Looks like a proxy" = a private address (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) or a Cloudflare
// address. The Cloudflare ranges below were copied from https://www.cloudflare.com/ips-v4 and
// https://www.cloudflare.com/ips-v6 on 2026-11-27. Cloudflare can change them, so this check can go
// stale: it only produces a hint in the log and never blocks or allows anything.

const PRIVATE_RANGES = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'];

const CLOUDFLARE_RANGES = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18',
  '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17',
  '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32',
  '2a06:98c0::/29', '2c0f:f248::/32',
];

// Returns { version: 4 | 6, value: BigInt } or null when the text is not an IP address.
function parseIp(text) {
  if (typeof text !== 'string') return null;
  let ip = text.trim();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip); // IPv4 inside IPv6, as Node reports it
  if (mapped) ip = mapped[1];

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.some((p) => p > 255)) return null;
    return { version: 4, value: parts.reduce((acc, p) => (acc << 8n) | BigInt(p), 0n) };
  }

  if (!/^[0-9a-f:]+$/i.test(ip) || !ip.includes(':')) return null;
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const toGroups = (s) => (s === '' ? [] : s.split(':'));
  const head = toGroups(halves[0]);
  const tail = halves.length === 2 ? toGroups(halves[1]) : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  return { version: 6, value: groups.reduce((acc, g) => (acc << 16n) | BigInt(parseInt(g, 16)), 0n) };
}

function parseRange(cidr) {
  const [address, bits] = cidr.split('/');
  const ip = parseIp(address);
  return { version: ip.version, value: ip.value, bits: Number(bits) };
}

const RANGES = [...PRIVATE_RANGES, ...CLOUDFLARE_RANGES].map(parseRange);

function isProxyAddress(text) {
  const ip = parseIp(text);
  if (!ip) return false;
  const total = ip.version === 4 ? 32n : 128n;
  return RANGES.some((range) => {
    if (range.version !== ip.version) return false;
    const shift = total - BigInt(range.bits);
    return ip.value >> shift === range.value >> shift;
  });
}

// Returns a one-line warning, or null when the address looks like a normal visitor.
function proxyChainWarning(ip) {
  if (!isProxyAddress(ip)) return null;
  const shown = String(ip).replace(/[^\x20-\x7e]/g, '?').slice(0, 45);
  return `WARNING: the rate limiter saw ${shown}, a private or Cloudflare address, not a visitor. TRUST_PROXY_HOPS is probably too low for the current proxy chain, so everyone behind it shares one limit. Re-check the X-Forwarded-For chain.`;
}

module.exports = { isProxyAddress, proxyChainWarning, parseIp };
