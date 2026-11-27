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

module.exports = app;
