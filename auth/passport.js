const bcrypt = require('bcryptjs');
const { Strategy: LocalStrategy } = require('passport-local');
const { normalizeEmail } = require('../lib/validation');

const BCRYPT_COST = 12;
// Compared against when the email is unknown, so that "unknown email" and
// "wrong password" take about the same time.
const DUMMY_HASH = bcrypt.hashSync('timing-safe-dummy-password', BCRYPT_COST);

// app.js calls this once at startup: configurePassport(passport, pool).
function configurePassport(passport, pool) {
  passport.use(
    new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
      // bcrypt.compare throws on non-strings; treat them as a normal failed login.
      if (typeof password !== 'string') return done(null, false);

      try {
        const { rows } = await pool.query(
          'SELECT id, password_hash FROM users WHERE email = $1',
          [normalizeEmail(email)]
        );
        const user = rows[0];

        if (!user) {
          await bcrypt.compare(password, DUMMY_HASH);
          return done(null, false);
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return done(null, false);

        return done(null, { id: user.id });
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const { rows } = await pool.query(
        'SELECT id, email, display_name, skin_type, skin_type_other FROM users WHERE id = $1',
        [id]
      );
      done(null, rows[0] || false);
    } catch (err) {
      done(err);
    }
  });
}

// Keep the default export a function (app.js requires it directly) and
// expose the cost factor as a property so routes/auth.js can reuse it.
module.exports = configurePassport;
module.exports.BCRYPT_COST = BCRYPT_COST;
