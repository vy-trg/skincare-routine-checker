// TODO(temporary): remove this file, its test and the middleware in routes/auth.js once the
// right TRUST_PROXY_HOPS value is known. It exists only to find which position of the
// X-Forwarded-For chain holds the real client IP on Render.
//
// It logs IP addresses of everyone who posts to /login, so keep it deployed for as short a time as
// possible. Values are cut and stripped of control characters because the header is client-controlled.

const MAX_ENTRIES = 10;
const MAX_ENTRY_LENGTH = 45; // longest IPv6 text form

function clean(value) {
  return String(value).replace(/[^\x20-\x7e]/g, '?').trim().slice(0, MAX_ENTRY_LENGTH);
}

// Returns one log line. `req` needs headers, ip, ips and socket (as an Express request has).
function describeProxyChain(req) {
  const header = req.headers && req.headers['x-forwarded-for'];
  const raw = Array.isArray(header) ? header.join(',') : typeof header === 'string' ? header : '';
  const entries = raw === '' ? [] : raw.split(',');
  const ips = Array.isArray(req.ips) ? req.ips : [];
  const shown = (list) => list.slice(0, MAX_ENTRIES).map(clean);
  return (
    'TEMP proxy chain on POST /login: ' +
    JSON.stringify({
      xffCount: entries.length,
      xff: shown(entries),
      reqIpsCount: ips.length,
      reqIps: shown(ips),
      reqIp: req.ip === undefined ? null : clean(req.ip),
      socket: req.socket && req.socket.remoteAddress ? clean(req.socket.remoteAddress) : null,
    })
  );
}

module.exports = { describeProxyChain };
