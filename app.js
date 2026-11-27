const path = require('node:path');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const passport = require('passport');

const pool = require('./db/pool');
const configurePassport = require('./auth/passport');

const isProduction = process.env.NODE_ENV === 'production';

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is not set. Add it to .env (see .env.example).');
}

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// On Render the app sits behind a proxy that terminates HTTPS. Without this,
// Express thinks every request is plain HTTP and never sends a `secure` cookie.
if (isProduction) {
  app.set('trust proxy', 1);
}

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

app.use(require('./routes/auth'));

app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Not found',
    heading: 'Page not found',
    message: 'That page does not exist.',
  });
});

// Express 5 forwards errors from async handlers here too.
// The real error goes to the log; the user only sees a generic message.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).render('error', {
    title: 'Something went wrong',
    heading: 'Something went wrong',
    message: 'Please try again in a moment.',
  });
});

module.exports = app;
