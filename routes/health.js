// GET /healthz, for Render's health check.
// It only proves the process is up and answering. It deliberately does not touch the database
// or the session store, so it cannot be slowed down or broken by either. That also means it
// keeps answering 200 if the database is down.
function healthz(req, res) {
  res.set('Cache-Control', 'no-store');
  res.status(200).json({ ok: true });
}

module.exports = healthz;
