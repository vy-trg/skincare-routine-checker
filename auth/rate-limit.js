// Rate limits for POST /login and POST /register: 10 attempts per 15 minutes per IP address.
//
// - Login counts only FAILED attempts. express-rate-limit treats a status below 400 as a success,
//   and a failed login answers 401 (auth/login-response.js), so failures are counted and
//   successful logins are not. People who share an IP (a campus, an office) do not lock each other out.
// - Register counts EVERY attempt, successful or not, otherwise one IP could create unlimited accounts.
// - The two limiters have separate counters and separate stores.
//
// The store is in memory: it is emptied when the app restarts, redeploys or wakes up from sleep,
// and it is not shared between instances (each instance counts on its own).
//
// The limit is keyed on req.ip. Behind a proxy that is only the real visitor if Express trusts the
// right number of proxies: see lib/trust-proxy.js (TRUST_PROXY_HOPS).
const rateLimit = require('express-rate-limit');
const { SKIN_TYPES } = require('../lib/skin-types');
const { normalizeEmail, validateRegistration } = require('../lib/validation');

const RATE_LIMIT = { windowMs: 15 * 60 * 1000, limit: 10 };

// How many whole minutes to tell the person to wait. resetTime is a Date, or undefined when the
// store cannot say; then the whole window is the safe answer. Never less than 1 minute and never
// more than the window.
function waitMinutes(resetTime, now = Date.now(), windowMs = RATE_LIMIT.windowMs) {
  const resetAt = resetTime instanceof Date ? resetTime.getTime() : NaN;
  const ms = Number.isFinite(resetAt) ? resetAt - now : windowMs;
  const windowMinutes = Math.ceil(windowMs / 60000);
  return Math.min(windowMinutes, Math.max(1, Math.ceil(ms / 60000)));
}

function limitMessage(minutes) {
  const unit = minutes === 1 ? 'minute' : 'minutes';
  return `Too many attempts. Please wait about ${minutes} ${unit} and try again.`;
}

// What the form shows again when the limit is hit. The password is never sent back.
function loginLocals(req, message) {
  return {
    title: 'Log In',
    errors: { form: message },
    values: { email: normalizeEmail(req.body && req.body.email) },
  };
}

function registerLocals(req, message) {
  const { clean } = validateRegistration(req.body || {});
  return {
    title: 'Create Account',
    errors: { form: message },
    values: {
      email: clean.email,
      display_name: clean.displayName,
      skin_type: clean.skinType,
      skin_type_other: clean.skinTypeOther,
    },
    skinTypes: SKIN_TYPES,
  };
}

// express-rate-limit calls this when someone is over the limit. It has already set Retry-After.
// `log` and `now` can be replaced in tests.
function createLimitHandler({ view, route, buildLocals, log = console.warn, now = Date.now }) {
  return (req, res) => {
    const info = req.rateLimit || {};
    // One log line when the block starts (not one per blocked request). It names the IP the limiter
    // used, so it can be compared with the real one when checking the proxy setting.
    if (typeof info.used === 'number' && info.used === info.limit + 1) {
      log(`Rate limit reached for ${route} from ${req.ip}`);
    }
    const minutes = waitMinutes(info.resetTime, now(), RATE_LIMIT.windowMs);
    res.status(429).render(view, buildLocals(req, limitMessage(minutes)));
  };
}

// Create these once, when the app starts (express-rate-limit requires it).
function createAuthLimiters(handlerOptions = {}) {
  const common = {
    windowMs: RATE_LIMIT.windowMs,
    limit: RATE_LIMIT.limit,
    standardHeaders: true, // RateLimit headers, and Retry-After when blocked
    legacyHeaders: false,
  };
  return {
    loginLimiter: rateLimit({
      ...common,
      skipSuccessfulRequests: true,
      handler: createLimitHandler({ view: 'login', route: 'POST /login', buildLocals: loginLocals, ...handlerOptions }),
    }),
    registerLimiter: rateLimit({
      ...common,
      handler: createLimitHandler({ view: 'register', route: 'POST /register', buildLocals: registerLocals, ...handlerOptions }),
    }),
  };
}

module.exports = { RATE_LIMIT, waitMinutes, limitMessage, createLimitHandler, createAuthLimiters };
