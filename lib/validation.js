// Pure validation helpers: no database, no Express, easy to unit test.
const { SKIN_TYPES } = require('./skin-types');

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 72;
const BCRYPT_MAX_BYTES = 72; // bcrypt silently ignores everything after 72 bytes
const DISPLAY_NAME_MAX_LENGTH = 60;
const SKIN_TYPE_OTHER_MAX_LENGTH = 100;

// Form fields can arrive as arrays or undefined (e.g. ?email=a&email=b),
// so never assume a string.
function toText(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeEmail(value) {
  return toText(value).trim().toLowerCase();
}

// Deliberately loose: one @, something on both sides, a dot in the domain, no spaces.
// The only real proof an address works is sending mail to it.
function isValidEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Returns an error message, or null if the password is acceptable.
// Passwords are never trimmed: leading/trailing spaces are part of the password.
function validatePassword(value) {
  const password = toText(value);
  const length = [...password].length; // count characters, not UTF-16 units
  if (length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  if (Buffer.byteLength(password, 'utf8') > BCRYPT_MAX_BYTES) {
    return 'Password is too long. Accented letters and emoji count as more than one byte, and the limit is 72 bytes.';
  }
  return null;
}

function normalizeDisplayName(value) {
  return toText(value).trim() || null;
}

// Returns { skinType, skinTypeOther, error } where error is { field, message } or null.
// Rules:
//   - empty skin type          -> both stored as null
//   - unknown skin type        -> error
//   - 'other'                  -> the free-text description is required
//   - anything except 'other'  -> the free-text description is discarded (null)
function normalizeSkinType(typeValue, otherValue) {
  const type = toText(typeValue).trim();
  const other = toText(otherValue).trim();

  if (type === '') {
    return { skinType: null, skinTypeOther: null, error: null };
  }
  if (!SKIN_TYPES.includes(type)) {
    return {
      skinType: null,
      skinTypeOther: null,
      error: { field: 'skin_type', message: 'Choose one of the listed skin types.' },
    };
  }
  if (type !== 'other') {
    return { skinType: type, skinTypeOther: null, error: null };
  }
  if (other === '') {
    return {
      skinType: type,
      skinTypeOther: null,
      error: { field: 'skin_type_other', message: 'Tell us a little about your skin type.' },
    };
  }
  if (other.length > SKIN_TYPE_OTHER_MAX_LENGTH) {
    return {
      skinType: type,
      skinTypeOther: null,
      error: {
        field: 'skin_type_other',
        message: `Keep this under ${SKIN_TYPE_OTHER_MAX_LENGTH} characters.`,
      },
    };
  }
  return { skinType: type, skinTypeOther: other, error: null };
}

// Validates the whole registration form body.
// Returns { errors, clean }. `errors` maps field name -> message (empty if valid).
// `clean` holds the normalised values to store; it never contains the password.
function validateRegistration(body) {
  const input = body || {};
  const errors = {};

  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) {
    errors.email = 'Enter a valid email address.';
  }

  const passwordError = validatePassword(input.password);
  if (passwordError) {
    errors.password = passwordError;
  }

  const displayName = normalizeDisplayName(input.display_name);
  if (displayName && [...displayName].length > DISPLAY_NAME_MAX_LENGTH) {
    errors.display_name = `Keep your display name under ${DISPLAY_NAME_MAX_LENGTH} characters.`;
  }

  const skin = normalizeSkinType(input.skin_type, input.skin_type_other);
  if (skin.error) {
    errors[skin.error.field] = skin.error.message;
  }

  return {
    errors,
    clean: {
      email,
      displayName,
      skinType: skin.skinType,
      skinTypeOther: skin.skinTypeOther,
    },
  };
}

module.exports = {
  normalizeEmail,
  isValidEmail,
  validatePassword,
  normalizeDisplayName,
  normalizeSkinType,
  validateRegistration,
};
