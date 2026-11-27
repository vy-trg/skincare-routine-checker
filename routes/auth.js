const express = require('express');
const { SKIN_TYPES } = require('../lib/skin-types');

const router = express.Router();

router.get('/', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');
  res.render('home', { title: 'Home' });
});

router.get('/login', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/');
  res.render('login', { title: 'Log in', errors: {}, values: {} });
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

module.exports = router;
