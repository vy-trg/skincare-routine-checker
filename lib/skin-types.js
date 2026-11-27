// Single source of truth for the skin types allowed by the CHECK constraint
// on users.skin_type in db/schema.sql. Keep the two in sync.
const SKIN_TYPES = ['dry', 'oily', 'combination', 'normal', 'sensitive', 'other'];

module.exports = { SKIN_TYPES };
