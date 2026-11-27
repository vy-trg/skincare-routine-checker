# Skincare Routine Checker

Paste a product's ingredient list, see which known skincare actives it contains, and check your morning and evening routines for combinations that are often advised to be used at different times.

**Live demo:** https://skincare-routine-checker.onrender.com/

_It runs on Render's free tier, which goes to sleep when idle, so the first load can take up to a minute._

![The home page after analysing a sample ingredient list: seven known actives found, the first one expanded to show its summary and source link, and the searchable Known Actives list on the right](docs/screenshot.png)

## The Problem

Ingredient lists on skincare labels are long, written in INCI names, and hard to read. Online advice about which products "cannot be mixed" is full of myths, and it rarely says where a claim comes from. This app reads a pasted ingredient list, picks out the active ingredients it recognises, and explains each one in a sentence with a link to its source. Signed-in users can build morning and evening routines and see warnings only for combinations backed by a source that was actually opened.

## Features

- **Ingredient analyser (no login needed):** paste a list, press Analyse Ingredients, and get one expandable item per known active with a short summary, its category and a source link. Keyboard friendly, and it respects reduced-motion settings.
- **Known Actives panel:** a searchable, scrollable list of the 28 actives the app recognises.
- **Accounts:** register and log in with an email and password, and optionally save a skin type.
- **My Products:** add, list and delete your own products. Actives are worked out when the page is read, not stored.
- **Morning and Evening routines:** add your products to each routine, see the combined actives, and get warnings with a one-sentence reason and a source link. If both actives sit in the same product, the page says so.
- **JSON API:** `POST /api/analyze` (public) and `GET /healthz` (for the host's health check).

## Tech Stack

Node.js 22, Express 5, EJS templates, PostgreSQL (Neon) through `pg`, Passport (local strategy) with `bcryptjs`, `express-session` with `connect-pg-simple`, plain JavaScript in the browser (no front-end framework), the built-in `node:test` runner, and GitHub Actions for CI.

## How Sources Are Handled

The data is in [`data/actives.json`](data/actives.json) (28 actives) and [`data/rules.json`](data/rules.json) (4 rules).

- Every `sourceUrl` is a page that was actually opened and names that exact ingredient or combination. No link was added from memory. Tests check that each one is a non-empty `https` URL.
- Actives are sourced from DermNet NZ where it has a page, and from review articles on PMC otherwise. Two candidates (bakuchiol and betaine salicylate) were dropped because no source could be verified.
- Rules cover AHA + retinoid, AHA + benzoyl peroxide, salicylic acid + retinoid and salicylic acid + benzoyl peroxide, from the American Academy of Dermatology and DermNet NZ. Each reason is worded to say no more than its source does.

**Popular claims that were not added:**

- Niacinamide + vitamin C: no evidence found that they cancel each other out.
- Benzoyl peroxide + retinol or retinal: no source. Adapalene with benzoyl peroxide is a marketed combination, so there is no blanket retinoid rule either.
- AHA + BHA, vitamin C + retinoid, vitamin C + benzoyl peroxide, and two retinoids together: no source.
- Niacinamide + retinol, and hyaluronic acid + vitamin C: no source.

## Run It Locally

You need Node.js 22 and a PostgreSQL database (a free Neon branch works).

```bash
npm install
cp .env.example .env              # then set DATABASE_URL and SESSION_SECRET
psql "$DATABASE_URL" -f db/schema.sql   # on an empty database
npm run dev                       # http://localhost:3000 (set PORT to change it)
npm test                          # no database or .env needed
```

In production, set `DATABASE_URL`, `SESSION_SECRET` and `NODE_ENV=production`, run `npm start`, and point the health check at `/healthz`. That endpoint only shows the process is up: it does not check the database.

Optional: `TRUST_PROXY_HOPS` (a whole number from 1 to 10, default 3) is how many proxies sit in front of the app in production. It decides which IP address the rate limits see (see Security Choices). The default is right for Render and needs no setting there.

## Security Choices

- Rate limiting: `POST /login` and `POST /register` allow 10 attempts per 15 minutes per IP address (`express-rate-limit`). Login counts only failed attempts; register counts every attempt. Past the limit the form comes back with status 429, the email still filled in and how long to wait. The counters live in memory, so they reset whenever the app restarts, redeploys or wakes up from sleep, and they do not work across multiple instances (each instance counts on its own). Behind a proxy the limit is only per visitor if `TRUST_PROXY_HOPS` matches the real number of proxies: too low and everyone shares one limit, too high and a visitor can fake their address with an `X-Forwarded-For` header. On Render the `X-Forwarded-For` chain was checked in production and is `[client, Cloudflare, Render's internal proxy]`. Render appends to the header without clearing it, so anything a visitor sends stays on the left; trusting exactly 3 hops makes Express take the client from the first address it did not add itself, and values to the left of it are ignored. That is why the default is 3 and not 1 (with 1, the limiter saw a rotating internal proxy instead of the visitor). This depends on Render's current setup, which Render does not document: re-check it if the platform changes (for example by logging the chain once and finding your own IP in it).
- Passwords are hashed with bcrypt at cost 12, must be 8 to 72 characters, and are never trimmed.
- An unknown email still runs a bcrypt comparison against a dummy hash, and a wrong password and an unknown email give the same message, so login does not reveal which emails exist.
- Sessions are stored in Postgres. The browser only holds a signed session id in an `httpOnly`, `sameSite=lax` cookie (`secure` in production). The password hash is never loaded into `req.user`.
- Ownership checks on every query: products and routines are always filtered by the logged-in user's id, never by an id taken from the request. Another user's product id gives a 404, and the app checks ownership itself when adding a product to a routine because the schema does not.
- The public analyser API is mounted before the session middleware, so it never touches the session store or the database. Input is size-limited, results are built with `textContent`, and only `https` links are rendered.
- Tests never touch a database: they use pure functions and a fake connection pool.

## Known Limitations

- No CSRF token (the `sameSite=lax` cookie is the only protection), the rate limit is per IP only (no limit per email, and people who share an IP share one limit), and registration reveals whether an email is already registered.
- Only 28 actives and 4 rules, matched by exact name (no fuzzy matching), so "no known actives found" does not mean a product has none, and "no warning" does not mean a routine suits you.
- Warnings work on actives, not on formulas: concentration, pH and how a product is made are not considered, and alternate-day routines are not modelled.
- Products cannot be edited, routines cannot be reordered, and there is no limit or paging on products.
- Analysing a list needs JavaScript, and only the first 5,000 characters of a list are checked.

## Not Medical Advice

For general information only. This is not medical advice. Check with a doctor or pharmacist before changing your skincare, especially if you use prescription treatments.
