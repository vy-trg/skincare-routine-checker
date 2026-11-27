// Express middleware: lets a request through only when the user is logged in.
// Pages get a redirect to /login; anything under /api gets a 401 JSON error instead,
// because a script cannot follow a redirect to an HTML page in a useful way.
//
// Note: /api is mounted BEFORE the session middleware in app.js (so /api/analyze stays public
// and never touches the database). A future /api route that needs a user must live in a
// router mounted AFTER the session middleware.

function isApiPath(url) {
  const path = String(url || '').split('?')[0];
  return path === '/api' || path.startsWith('/api/');
}

function requireLogin(req, res, next) {
  const loggedIn = typeof req.isAuthenticated === 'function' && req.isAuthenticated();
  if (loggedIn) return next();

  if (isApiPath(req.originalUrl || req.url)) {
    return res.status(401).json({ error: 'Log in required.' });
  }
  return res.redirect('/login');
}

module.exports = requireLogin;
