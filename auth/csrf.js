// CSRF protection for every state-changing form (signed double-submit cookie, csrf-csrf).
//
// How it works:
// - The server sets a cookie `<hmac>.<random>` (httpOnly, sameSite lax, secure in production) and puts
//   the same string in a hidden `_csrf` field of every POST form. A POST is accepted only if the field
//   equals the cookie AND the hmac is valid. The hmac is HMAC-SHA256, keyed with a secret derived from
//   SESSION_SECRET, over the "session identifier" and the random part. Another website can neither read
//   the cookie nor put one in the visitor's browser, so it cannot produce a matching pair.
// - Guests have no session (saveUninitialized is false), so the identifier for a guest is a constant and
//   no database row is written. A logged-in user's identifier is their session id, so a token from one
//   session is refused in another, and login/logout (which start a new session) make old tokens invalid.
// - Order in app.js: after the session and passport, BEFORE the routes. So a request with a bad token is
//   refused before the rate limiters in routes/auth.js and does not count toward the login limit
//   (it tried no password, and a forged cross-site form must not be able to use up someone's budget).
const crypto = require('node:crypto');
const { doubleCsrf } = require('csrf-csrf');
const { loginLocals, registerLocals } = require('./form-locals');

const GUEST_IDENTIFIER = 'guest';
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // same as the session cookie
const ERROR_CODE = 'EBADCSRFTOKEN';
const FIELD_NAME = '_csrf';

const EXPIRED_MESSAGE =
  'This form expired. Please reload the page and try again. If it keeps happening, check that your browser allows cookies.';

// A separate secret for this purpose, derived from SESSION_SECRET so no new setting is needed.
function deriveCsrfSecret(sessionSecret) {
  if (typeof sessionSecret !== 'string' || sessionSecret === '') {
    throw new Error('A non-empty session secret is needed to derive the CSRF secret.');
  }
  return crypto.createHmac('sha256', sessionSecret).update('csrf-csrf').digest('hex');
}

// What a token is tied to: the session id for a logged-in user, a constant for everybody else.
function sessionIdentifier(req) {
  const id = req.session && req.session.id;
  if (req.user && typeof id === 'string' && id !== '') return `session:${id}`;
  return GUEST_IDENTIFIER;
}

// Only the form body counts. Never the cookie, and no fallback to a header.
function tokenFromRequest(req) {
  const value = req.body && req.body[FIELD_NAME];
  return typeof value === 'string' ? value : undefined;
}

function csrfCookie(isProduction) {
  return {
    // "__Host-" needs HTTPS (secure) and path "/", so it is used only in production.
    cookieName: isProduction ? '__Host-csrf' : 'csrf',
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      path: '/',
      maxAge: COOKIE_MAX_AGE_MS,
    },
  };
}

function isCsrfError(err) {
  return Boolean(err) && err.code === ERROR_CODE;
}

// Which page to answer a refused POST with. Login and register show the form again with what was typed
// (never the password); every other form gets the general error page.
function csrfFailure(req) {
  const path = String(req.path || '').toLowerCase().replace(/\/+$/, '');
  if (path === '/login') return { view: 'login', locals: loginLocals(req, EXPIRED_MESSAGE) };
  if (path === '/register') return { view: 'register', locals: registerLocals(req, EXPIRED_MESSAGE) };
  return {
    view: 'error',
    locals: { title: 'Form Expired', heading: 'This Form Expired', message: EXPIRED_MESSAGE },
  };
}

// Create once, when the app starts.
function createCsrf({ sessionSecret, isProduction }) {
  const secret = deriveCsrfSecret(sessionSecret);
  const { cookieName, cookieOptions } = csrfCookie(Boolean(isProduction));
  const { doubleCsrfProtection } = doubleCsrf({
    getSecret: () => secret,
    getSessionIdentifier: sessionIdentifier,
    cookieName,
    cookieOptions,
    getCsrfTokenFromRequest: tokenFromRequest,
  });

  // Gives views `csrfToken()`. It is a function, called only by templates that have a form: Express
  // copies every res.locals value on each render, so a getter would run for every page. The token is
  // made once per request. Must come BEFORE `protection`, so it also exists when the check fails.
  function attachToken(req, res, next) {
    let token;
    res.locals.csrfToken = () => {
      if (token === undefined) token = req.csrfToken();
      return token;
    };
    next();
  }

  // Refuses a POST without a valid token (GET, HEAD and OPTIONS pass). Sets req.csrfToken.
  const protection = doubleCsrfProtection;

  // Error handler: a refused POST gets a friendly 403 page. Other errors go on to the next handler.
  // eslint-disable-next-line no-unused-vars
  function errorHandler(err, req, res, next) {
    if (!isCsrfError(err) || res.headersSent) return next(err);
    const { view, locals } = csrfFailure(req);
    res.status(403).render(view, locals);
  }

  return { cookieName, attachToken, protection, errorHandler };
}

module.exports = {
  GUEST_IDENTIFIER,
  FIELD_NAME,
  EXPIRED_MESSAGE,
  deriveCsrfSecret,
  sessionIdentifier,
  tokenFromRequest,
  csrfCookie,
  isCsrfError,
  csrfFailure,
  createCsrf,
};
