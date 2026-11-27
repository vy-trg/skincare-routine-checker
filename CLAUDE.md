# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` runs `node --env-file=.env --watch server.js`. Needs Node 22.x (pinned in `engines`, same major as CI; other versions only get an npm warning) and a `.env` with `DATABASE_URL` and `SESSION_SECRET` (see `.env.example`). The port comes from `PORT` and defaults to 3000.
- `npm start` runs `node server.js` (what Render runs; it reads no `.env`, so the host must provide `DATABASE_URL`, `SESSION_SECRET` and `NODE_ENV=production`). Use `npm run dev` locally.
- `npm test` runs `node --test`, which picks up every `*.test.js` file. `package.test.js` fails if `start`, the Node pin and the Node version in CI drift apart.
- Run one test file: `node --test lib/validation.test.js`. Filter by name: `node --test --test-name-pattern="password" lib/validation.test.js`.
- There is no build step and no linter configured.
- CI (`.github/workflows/ci.yml`, job `test`) runs `npm ci` and `npm test` on Node 22 for every pull request and for pushes to `main`. It has no database and no secrets.

**Tests must never touch a database.** Test only pure functions (`lib/`) or code that receives a fake `pool` (see `auth/passport.test.js`). Do not `require` `db/pool.js` or `app.js` from a test: `db/pool.js` throws when `DATABASE_URL` is missing, and CI does not set it.

## Stack

Express 5, EJS views, PostgreSQL on Neon through the `pg` package, Passport (local strategy) with `bcryptjs`, CommonJS modules.

## Structure

- `server.js` only calls `listen`. `app.js` builds and exports the Express app (middleware order matters: static files, body parser, session, `passport.initialize()`, `passport.session()`, then `res.locals.currentUser`, then routes, then the 404 and error handlers).
- `db/pool.js` is the single shared `pg` Pool. `db/schema.sql` is the source of truth for the schema; there is no migration tool.
- `routes/auth.js` has the page routes: `/` (the home page, public: anyone can analyse an ingredient list), `/login`, `/register`, `/logout` (logout is POST).
- `GET /healthz` (`routes/health.js`) is Render's health check. `app.js` mounts it first, before static files, `/api` and the session, so it never touches the database; it answers 200 even if the database is down.
- `routes/api.js` is the JSON API (`POST /api/analyze`, body `{ "text": "..." }`). `app.js` mounts it **before** the session middleware on purpose: it needs no login and must never touch the session store or the database. Its logic lives in the pure `lib/analyze.js`.
- `routes/products.js` (`/products`) and `routes/routines.js` (`/routines/am`, `/routines/pm`) are factories (`createProductsRouter(store)`, `createRoutinesRouter({ routines, products })`) that apply `requireLogin` from `auth/require-login.js` (anonymous pages redirect to `/login`, anonymous `/api` paths get 401 JSON). `app.js` wires them to the stores in `db/products.js` and `db/routines.js`, which are also factories that receive the pool so tests can pass a fake one (`db/stores.test.js`).
- **Ownership rule:** every query is filtered by the user id from `req.user.id`, never by an id from the body or URL. A routine is never addressed by id: it is "this user's AM/PM routine", found by `(user_id, period)` and created on first add. Product deletes and routine-item changes use `WHERE ... AND user_id = $n` and a miss (missing or someone else's id) is a 404. Adding a product to a routine first checks that the product is the user's, because `routine_items` does not enforce it. Ids from URLs and forms go through `parseId` in `lib/products.js` (plain positive integers that fit a Postgres INTEGER, else 404), so a bad id never reaches Postgres. Any new user-owned query must follow the same pattern.
- `lib/products.js` has `validateProduct` (name 1-100 characters, ingredient list rejected above the 5,000-character parser limit and rejected if it holds a NUL character), `parseId` and `parsePeriod`. `lib/routine-summary.js` (`summarizeRoutine`) finds the actives of the products in one routine on every read (nothing is stored), runs `checkRoutine`, and marks a warning `inSameProduct` when one product already holds both actives.
- `auth/passport.js` exports `configurePassport(passport, pool)` as the module itself and `BCRYPT_COST` as a property of it. It defines the local strategy (login field is `email`), `serializeUser` (stores only the user id) and `deserializeUser`.
- `lib/ingredients.js` reads pasted ingredient lists: `parseIngredients` splits and normalises (brackets stay attached, `1,2-Hexanediol` is not split, input is capped at 5,000 characters) and `findActives` matches the items against the aliases in `data/actives.json`. Matching is exact on the whole name, ignoring case and treating hyphens like spaces; there is no substring or fuzzy matching, so "Retinol" never matches "Retinyl Palmitate".
- `data/actives.json` lists the known actives (`id`, `name`, `inciAliases`, `category`, `summary`, `sourceUrl`). Every non-empty `sourceUrl` must be a page that was actually opened and names that exact ingredient; never add a URL from memory. `data/actives.test.js` checks the shape (unique ids and aliases, allowed categories).
- `lib/rules.js` exports the pure `checkRoutine(activeIds, actives, rules)`. It checks ONE routine (AM or PM, never both together) against `data/rules.json` and returns one warning per unordered pair (`a+b` is the same as `b+a`; never an active paired with itself). A rule side is an active id or a category from `actives.json`; a category expands to the actives of that category that are in the routine. If several rules match a pair, the most severe wins (`avoid` over `caution`, then the rule listed first). The output order does not depend on the input order. Only `scope: "same-routine"` rules are used. Nothing calls it yet (no endpoint or UI).
- `data/rules.json` lists the conflict rules (`id`, `a`, `b`, `severity`, `scope`, `reason`, `sourceUrl`). Same rule as actives: add a rule only if a page that was actually opened names both sides and discusses using them together; never add one from memory or because it is widely repeated (for example niacinamide + vitamin C: no evidence was found that they cancel each other out). The `reason` must not state more than the source does. Category-level rules must hold for every active in the category: there is no retinoid + benzoyl peroxide rule because adapalene + benzoyl peroxide is a marketed combination. `data/rules.test.js` checks the shape.
- `lib/validation.js` holds the pure validation and normalisation helpers (email, password, display name, skin type). `lib/skin-types.js` is the list of skin types and must match the CHECK constraint on `users.skin_type` in `db/schema.sql`.
- `views/` has EJS templates; `views/partials/head.ejs` and `foot.ejs` wrap every page (the masthead shows Log In and Create Account, or the product and routine links plus Log Out). `public/` has static CSS and the small script that shows the "Other" skin type field.
- **Home page** (`views/home.ejs`, `public/home.js`, `public/analyse-helpers.js`): the browser sends the pasted list to `POST /api/analyze` and renders one `<details>` per active (DOM built with `textContent`, links only if `https://`). The Known Actives panel is rendered by the server and only filtered by JavaScript. All pure logic (filter, category labels, error and empty messages, link check, motion timings) is in `public/analyse-helpers.js`, which works in the browser and in Node; its tests are `lib/analyse-helpers.test.js`. **Do not put test files in `public/`**: everything there is served to the world. Accordion motion is Web Animations API (200ms open, 160ms close, ease-out), row stagger is 30ms per row (capped), and `prefers-reduced-motion` turns animation off.
- `views/partials/disclaimer.ejs` is the "not medical advice" notice. It must stay on the home page and on every routine page.
- UI text: headings and buttons use Title Case (not uppercase). Spacing uses the `--space-*` tokens in `public/style.css`.

## Sessions and auth

- Sessions are stored in Postgres by `connect-pg-simple`, in the existing `"session"` table (`createTableIfMissing: false`, so the table must already exist). The browser only gets the `connect.sid` cookie, which holds a signed session id; the user id lives in the row's `sess` JSON under `passport.user`.
- Cookie: `httpOnly`, `sameSite: lax`, `secure` only when `NODE_ENV=production`, 7 days. `trust proxy` is enabled in production so the secure cookie works behind Render. The number of proxies is `TRUST_PROXY_HOPS` (default 1, parsed by `lib/trust-proxy.js`; Render's proxy chain is not documented, so verify it after deploying).
- **Rate limits** (`auth/rate-limit.js`, applied in `routes/auth.js`): `POST /login` and `POST /register`, 10 per 15 minutes per `req.ip`, with separate limiters and stores created once at start-up. Login uses `skipSuccessfulRequests`, which counts status 400 and above, so a failed login MUST answer 401 and never redirect (`auth/login-response.js`; a test guards this). Register counts every attempt. At the limit the form is re-rendered with status 429, the email kept and the minutes to wait; one log line is written when a block starts. The store is in memory: reset on restart, not shared between instances.
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

- No CSRF token, rate limiting is per IP only (no per-email limit; shared IPs share a budget; a database outage answers 500, which counts as a failed login), and registration reveals whether an email is already registered.
- `routine_items` does not enforce that a product belongs to the same user as the routine; the application must check ownership.
- `position` is not unique within a routine, so ordering ties are possible.
- `checkRoutine` works on active ids, not products: two actives inside one product can still be flagged. It ignores concentration, pH and formulation, and it does not model alternate-day schedules.
- Products can be added, listed and deleted, and put in or removed from the AM/PM routines. There is no edit, no reordering (items keep the order they were added in), no limit on products per user and no pagination. `opened_on` and `pao_months` are not used yet.
- Analysing a list needs JavaScript (the page says so). The textarea has no length limit: above 5,000 characters only the start is checked and the page says so; a body over about 20KB gets a 413 message. Matching is exact on whole names, so "no known actives found" does not mean a product has none.
- A session that expires while a form is open redirects the POST to `/login`, so what was typed is lost. The delete buttons are POST forms without a CSRF token (the `sameSite: lax` cookie is the only protection).
- `/api` is mounted before the session middleware, so no `/api` route can see a user yet. A future API route that needs a user must live in a router mounted after the session middleware.
- The ownership tests only check what is sent to a fake pool; the SQL itself is verified by hand on the Neon dev branch.
