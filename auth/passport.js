// Passport configuration. Everything below is yours to write (issue #3).
// app.js calls this once at startup: configurePassport(passport, pool).

module.exports = function configurePassport(passport, pool) {
  // TODO(1): LocalStrategy
  //   - Use { usernameField: 'email' }; the login form field is called "email".
  //   - routes/auth.js already lowercases and trims the email before this runs,
  //     so look the user up with a plain `WHERE email = $1`.
  //   - Query users by email with pool.query (parameterised, never string concat).
  //   - Compare the submitted password with users.password_hash using bcryptjs.
  //   - Wrong password and unknown email must be indistinguishable to the caller:
  //     both end with done(null, false). Do not pass different messages.
  //   - Database errors go to done(err).
  //
  // TODO(2): Dummy-hash comparison for unknown emails
  //   - If no user is found, still run bcrypt.compare against a DUMMY_HASH
  //     before returning done(null, false). Otherwise an unknown email answers
  //     much faster than a wrong password (no bcrypt work), and an attacker can
  //     measure that difference to find out which emails are registered.
  //   - Create DUMMY_HASH once at module load (not per request) with the SAME
  //     cost factor you use when hashing in routes/auth.js, or the timings differ.
  //   - Discard the result of that compare; the answer is always "no".
  //
  // TODO(3): passport.serializeUser
  //   - Store only the user id in the session (it ends up in session.passport.user
  //     in the "session" table). Not the whole user, and never the password hash.
  //
  // TODO(4): passport.deserializeUser
  //   - Look the user up by id on every request.
  //   - SELECT only id, email, display_name, skin_type, skin_type_other.
  //     Never select password_hash: req.user is exposed to every view
  //     as `currentUser`.
  //   - If the row no longer exists (deleted account), call done(null, false)
  //     so the stale session is treated as logged out instead of crashing.
};
