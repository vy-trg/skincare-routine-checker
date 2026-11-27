const express = require('express');
const passport = require('passport');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { BCRYPT_COST } = require('../auth/passport');
const { SKIN_TYPES } = require('../lib/skin-types');
const { normalizeEmail, validateRegistration } = require('../lib/validation');

const router = express.Router();

router.get('/', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');
  res.render('home', { title: 'Home' });
});

router.get('/login', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/');
  res.render('login', { title: 'Log in', errors: {}, values: {} });
});

router.post('/login', (req, res, next) => {
  // Normalise here so the LocalStrategy always sees a trimmed, lowercase email.
  const email = normalizeEmail(req.body.email);
  req.body.email = email;

  passport.authenticate('local', (err, user) => {
    if (err) return next(err);
    if (!user) {
      // Same message for an unknown email and a wrong password.
      return res.status(401).render('login', {
        title: 'Log in',
        errors: { form: 'Incorrect email or password.' },
        values: { email },
      });
    }
    // req.login starts a fresh session (passport 0.6+), which prevents session fixation.
    req.login(user, (loginErr) => {
      if (loginErr) return next(loginErr);
      res.redirect('/');
    });
  })(req, res, next);
});

router.get('/register', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/');
  res.render('register', {
    title: 'Create account',
    errors: {},
    values: {},
    skinTypes: SKIN_TYPES,
  });
});

router.post('/register', async (req, res, next) => {
  const { errors, clean } = validateRegistration(req.body);

  // What to show again if registration fails. The password is never sent back.
  const renderForm = (status, formErrors) =>
    res.status(status).render('register', {
      title: 'Create account',
      errors: formErrors,
      values: {
        email: clean.email,
        display_name: clean.displayName,
        skin_type: clean.skinType,
        skin_type_other: clean.skinTypeOther,
      },
      skinTypes: SKIN_TYPES,
    });

  if (Object.keys(errors).length > 0) return renderForm(400, errors);

  try {
    const passwordHash = await bcrypt.hash(req.body.password, BCRYPT_COST);

    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, display_name, skin_type, skin_type_other)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, display_name, skin_type, skin_type_other`,
      [clean.email, passwordHash, clean.displayName, clean.skinType, clean.skinTypeOther],
    );

    // Log the new user in straight away. This relies on serializeUser (auth/passport.js).
    req.login(rows[0], (loginErr) => {
      if (loginErr) return next(loginErr);
      res.redirect('/');
    });
  } catch (err) {
    // 23505 = unique_violation: the email is already registered.
    // Checking the database error (not querying first) is race-free when two
    // sign-ups with the same email arrive at the same time.
    if (err.code === '23505') {
      return renderForm(409, {
        email: 'That email is already registered. Try logging in instead.',
      });
    }
    next(err);
  }
});

router.post('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect('/login');
  });
});

module.exports = router;
