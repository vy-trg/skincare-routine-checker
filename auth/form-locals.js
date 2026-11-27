// What the login and register forms need to be shown again with an error message. Shared by the
// rate limiter (429) and the CSRF check (403). The password is never part of it.
const { SKIN_TYPES } = require('../lib/skin-types');
const { normalizeEmail, validateRegistration } = require('../lib/validation');

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

module.exports = { loginLocals, registerLocals };
