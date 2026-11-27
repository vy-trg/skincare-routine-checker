// How many proxies sit in front of the app in production (Express "trust proxy" as a hop count).
//
// This decides what req.ip is, and the login and register rate limits are keyed on req.ip:
// - Too LOW (for example 1 when there are 2 proxies): req.ip is a proxy's address, so every visitor
//   shares one limit and a few failed logins would lock everyone out.
// - Too HIGH: a visitor can send their own X-Forwarded-For entries and pick the address that is counted.
// Render does not document its proxy chain, so the number can be set with TRUST_PROXY_HOPS
// without changing code. The default is 1.

const DEFAULT_HOPS = 1;
const MAX_HOPS = 10;

// value: the raw environment variable (a string, or undefined when it is not set).
// Returns { hops, ignored }. `ignored` is true when a value was given but could not be used,
// so the caller can log a warning instead of silently trusting a wrong number.
function parseTrustProxyHops(value) {
  if (value === undefined || value === null || value === '') {
    return { hops: DEFAULT_HOPS, ignored: false };
  }
  if (typeof value === 'string' && /^[1-9]\d{0,1}$/.test(value.trim())) {
    const hops = Number(value.trim());
    if (hops <= MAX_HOPS) return { hops, ignored: false };
  }
  return { hops: DEFAULT_HOPS, ignored: true };
}

module.exports = { DEFAULT_HOPS, MAX_HOPS, parseTrustProxyHops };
