const { Pool } = require('pg');

// Fail early with a clear message instead of a confusing connection error later.
// The value of DATABASE_URL is never printed.
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Add it to .env (see .env.example).');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// An idle client can error (e.g. Neon closes the connection while the compute is
// suspended). Without this listener the error would crash the whole process.
pool.on('error', (err) => {
  console.error('Unexpected error on idle database client:', err.message);
});

module.exports = pool;
