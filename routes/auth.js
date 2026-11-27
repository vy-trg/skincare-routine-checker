const express = require('express');
const passport = require('passport');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { BCRYPT_COST } = require('../auth/passport');
const { loginResponse } = require('../auth/login-response');
const { createAuthLimiters } = require('../auth/rate-limit');
const { describeProxyChain } = require('../lib/proxy-diagnostic'); // TODO(temporary)
const actives = require('../data/actives.json');
const { categoryLabel } = require('../public/analyse-helpers');
const { SKIN_TYPES } = require('../lib/skin-types');
const { normalizeEmail, validateRegistration } = require('../lib/validation');

const router = express.Router();

// Created once, at start-up. Only the two POST routes below use them, not the GET pages.
const { loginLimiter, registerLimiter } = createAuthLimiters();

// The Known Actives panel: what the page needs and nothing else (no summaries or source URLs).
const knownActives = actives.map(({ id, name, category, inciAliases }) => ({
  id,
  name,
  category,
  inciAliases,
}));

// Public: anyone can paste an ingredient list here. The analysis itself runs in the browser
// against POST /api/analyze, which needs no login and no database.
router.get('/', (req, res) => {
  res.render('home', {
    title: 'Check Your Ingredients',
    actives: knownActives,
    categoryLabel,
  });
});

router.get('/login', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/');
  res.render('login', { title: 'Log In', errors: {}, values: {} });
});

// TODO(temporary): remove this logger (and lib/proxy-diagnostic.js) once TRUST_PROXY_HOPS is settled.
// It runs before the limiter so blocked requests are logged too.
router.post('/login', (req, res, next) => { console.log(describeProxyChain(req)); next(); });

router.post('/login', loginLimiter, (req, res, next) => {
  // Normalise here so the LocalStrategy always sees a trimmed, lowercase email.
  const email = normalizeEmail(req.body.email);
  req.body.email = email;

  // A failed login answers 401 and a successful one redirects: see auth/login-response.js.
  passport.authenticate('local', loginResponse(req, res, next, email))(req, res, next);
});

router.get('/register', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/');
  res.render('register', {
    title: 'Create Account',
    errors: {},
    values: {},
    skinTypes: SKIN_TYPES,
  });
});

router.post('/register', registerLimiter, async (req, res, next) => {
  const { errors, clean } = validateRegistration(req.body);

  // What to show again if registration fails. The password is never sent back.
  const renderForm = (status, formErrors) =>
    res.status(status).render('register', {
      title: 'Create Account',
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
