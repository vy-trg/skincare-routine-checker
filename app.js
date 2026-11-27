const path = require('node:path');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const passport = require('passport');
const cookieParser = require('cookie-parser');

const pool = require('./db/pool');
const configurePassport = require('./auth/passport');
const { createCsrf } = require('./auth/csrf');
const { parseTrustProxyHops } = require('./lib/trust-proxy');
const healthz = require('./routes/health');
const { createProductStore } = require('./db/products');
const { createRoutineStore } = require('./db/routines');
const { createProductsRouter } = require('./routes/products');
const { createRoutinesRouter } = require('./routes/routines');

const isProduction = process.env.NODE_ENV === 'production';

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is not set. Add it to .env (see .env.example).');
}

const csrf = createCsrf({ sessionSecret: process.env.SESSION_SECRET, isProduction });

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// On Render the app sits behind a proxy that terminates HTTPS. Without this,
// Express thinks every request is plain HTTP and never sends a `secure` cookie.
// How many proxies to trust is set with TRUST_PROXY_HOPS (default 3, the proxy chain on Render): it decides what req.ip is,
// and the login and register rate limits are keyed on it. See lib/trust-proxy.js.
if (isProduction) {
  const { hops, ignored } = parseTrustProxyHops(process.env.TRUST_PROXY_HOPS);
  if (ignored) {
    console.warn(`TRUST_PROXY_HOPS must be a whole number from 1 to 10. Ignoring it and using ${hops}.`);
  }
  app.set('trust proxy', hops);
}

// Render's health check. Mounted first on purpose: no static files, no session, no database.
app.get('/healthz', healthz);

app.use(express.static(path.join(__dirname, 'public')));

// The JSON API is mounted before the session middleware on purpose: it needs
// no login and must never touch the session store or the database.
app.use('/api', require('./routes/api'));

app.use(express.urlencoded({ extended: false }));

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: 'session', // the table already exists in db/schema.sql
      createTableIfMissing: false,
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false, // no DB row until something is stored in the session
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction, // secure cookies would not work over http://localhost
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days; also drives the `expire` column
    },
  }),
);

configurePassport(passport, pool);
app.use(passport.initialize());
app.use(passport.session());

// Make the logged-in user available to every EJS view as `currentUser`.
app.use((req, res, next) => {
  res.locals.currentUser = req.user || null;
  next();
});

// CSRF check for every POST below this point (the form token must match the csrf cookie and the session).
// It must stay AFTER the session and passport (it reads the session id) and BEFORE the routes, so a POST
// with a bad token is refused before the login and register rate limits and does not count toward them.
// /healthz and /api are mounted above it on purpose and are not affected. See auth/csrf.js.
app.use(cookieParser());
app.use(csrf.attachToken);
app.use(csrf.protection);

app.use(require('./routes/auth'));

// Pages that need a login (each router applies requireLogin itself).
const productStore = createProductStore(pool);
app.use('/products', createProductsRouter(productStore));
app.use(
  '/routines',
  createRoutinesRouter({ routines: createRoutineStore(pool), products: productStore }),
);

app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Not Found',
    heading: 'Page Not Found',
    message: 'That page does not exist.',
  });
});

// A POST that failed the CSRF check gets a friendly 403 page; every other error goes on to the handler below.
app.use(csrf.errorHandler);

// Express 5 forwards errors from async handlers here too.
// The real error goes to the log; the user only sees a generic message.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).render('error', {
    title: 'Something Went Wrong',
    heading: 'Something Went Wrong',
    message: 'Please try again in a moment.',
  });
});

module.exports = app;
