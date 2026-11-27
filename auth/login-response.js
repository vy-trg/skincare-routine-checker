// What POST /login answers once Passport has checked the credentials. It lives here, away from
// routes/auth.js (which needs the database pool), so a test can use the exact code the route uses.
//
// The status codes matter for rate limiting: express-rate-limit treats a status below 400 as a
// success. A failed login must therefore answer 401 with the form (never a redirect), and a
// successful one redirects. See auth/rate-limit.js, where the login limiter skips successes.

// Returns the callback for passport.authenticate('local', callback).
// `email` is the normalised email, shown again in the form when the login fails.
function loginResponse(req, res, next, email) {
  return (err, user) => {
    if (err) return next(err);
    if (!user) {
      // Same message for an unknown email and a wrong password.
      return res.status(401).render('login', {
        title: 'Log In',
        errors: { form: 'Incorrect email or password.' },
        values: { email },
      });
    }
    // req.login starts a fresh session (passport 0.6+), which prevents session fixation.
    req.login(user, (loginErr) => {
      if (loginErr) return next(loginErr);
      res.redirect('/');
    });
  };
}

module.exports = { loginResponse };
