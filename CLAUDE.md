# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` runs `node --env-file=.env --watch server.js`. Needs Node >= 20.6 and a `.env` with `DATABASE_URL` and `SESSION_SECRET` (see `.env.example`). The port comes from `PORT` and defaults to 3000.
- `npm test` runs `node --test`, which picks up every `*.test.js` file.
- Run one test file: `node --test lib/validation.test.js`. Filter by name: `node --test --test-name-pattern="password" lib/validation.test.js`.
- There is no build step and no linter configured.
- CI (`.github/workflows/ci.yml`, job `test`) runs `npm ci` and `npm test` on Node 22 for every pull request and for pushes to `main`. It has no database and no secrets.

**Tests must never touch a database.** Test only pure functions (`lib/`) or code that receives a fake `pool` (see `auth/passport.test.js`). Do not `require` `db/pool.js` or `app.js` from a test: `db/pool.js` throws when `DATABASE_URL` is missing, and CI does not set it.

## Stack

Express 5, EJS views, PostgreSQL on Neon through the `pg` package, Passport (local strategy) with `bcryptjs`, CommonJS modules.

## Structure

- `server.js` only calls `listen`. `app.js` builds and exports the Express app (middleware order matters: static files, body parser, session, `passport.initialize()`, `passport.session()`, then `res.locals.currentUser`, then routes, then the 404 and error handlers).
- `db/pool.js` is the single shared `pg` Pool. `db/schema.sql` is the source of truth for the schema; there is no migration tool.
- `routes/auth.js` has the page routes: `/`, `/login`, `/register`, `/logout` (logout is POST).
- `routes/api.js` is the JSON API (`POST /api/analyze`, body `{ "text": "..." }`). `app.js` mounts it **before** the session middleware on purpose: it needs no login and must never touch the session store or the database. Its logic lives in the pure `lib/analyze.js`.
- `auth/passport.js` exports `configurePassport(passport, pool)` as the module itself and `BCRYPT_COST` as a property of it. It defines the local strategy (login field is `email`), `serializeUser` (stores only the user id) and `deserializeUser`.
- `lib/ingredients.js` reads pasted ingredient lists: `parseIngredients` splits and normalises (brackets stay attached, `1,2-Hexanediol` is not split, input is capped at 5,000 characters) and `findActives` matches the items against the aliases in `data/actives.json`. Matching is exact on the whole name, ignoring case and treating hyphens like spaces; there is no substring or fuzzy matching, so "Retinol" never matches "Retinyl Palmitate".
- `data/actives.json` lists the known actives (`id`, `name`, `inciAliases`, `category`, `summary`, `sourceUrl`). Every non-empty `sourceUrl` must be a page that was actually opened and names that exact ingredient; never add a URL from memory. `data/actives.test.js` checks the shape (unique ids and aliases, allowed categories).
- `lib/validation.js` holds the pure validation and normalisation helpers (email, password, display name, skin type). `lib/skin-types.js` is the list of skin types and must match the CHECK constraint on `users.skin_type` in `db/schema.sql`.
- `views/` has EJS templates; `views/partials/head.ejs` and `foot.ejs` wrap every page. `public/` has static CSS and the small script that shows the "Other" skin type field.

## Sessions and auth

- Sessions are stored in Postgres by `connect-pg-simple`, in the existing `"session"` table (`createTableIfMissing: false`, so the table must already exist). The browser only gets the `connect.sid` cookie, which holds a signed session id; the user id lives in the row's `sess` JSON under `passport.user`.
- Cookie: `httpOnly`, `sameSite: lax`, `secure` only when `NODE_ENV=production`, 7 days. `trust proxy` is enabled in production so the secure cookie works behind Render.
- Emails are trimmed and lowercased in the app (`normalizeEmail`) before every lookup or insert. The unique index on `users.email` is case-sensitive, so any new code path that handles emails must normalise first.
- `deserializeUser` must never select `password_hash`: `req.user` is exposed to every view as `currentUser`.
- Unknown email and wrong password must give the same message, and an unknown email still runs a bcrypt compare against a dummy hash to even out timing.
- Passwords are limited to 8-72 characters and 72 bytes (bcrypt ignores the rest) and are never trimmed.

## Database

PostgreSQL on Neon. The domain is a skincare routine checker: users own products (raw ingredient lists) and arrange them into AM/PM routines.

- `users`: email and `password_hash`; `skin_type` is constrained to a fixed set, with `skin_type_other` as free text for `'other'`.
- `products`: belong to a user; `ingredients_raw` is unparsed text. `opened_on` and `pao_months` support expiry checks.
- `routines`: at most one per `(user_id, period)` where period is `'am'` or `'pm'`.
- `routine_items`: join table between routines and products, ordered by `position`; a product appears once per routine.
- All user-owned tables cascade on user deletion.
- Schema changes: apply to the Neon dev branch first, then production, then merge. Keep `db/schema.sql` as the source of truth and record any `ALTER` statements you run.

## Known limitations

- No CSRF token, no login rate limiting, and registration reveals whether an email is already registered.
- `routine_items` does not enforce that a product belongs to the same user as the routine; the application must check ownership.
- `position` is not unique within a routine, so ordering ties are possible.
- Only `users` and sessions are used by the app so far; products and routines have schema but no routes yet.
