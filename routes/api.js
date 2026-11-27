const express = require('express');
const { analyzeRequest } = require('../lib/analyze');

const router = express.Router();

// A pasted ingredient list is capped at 5,000 characters (up to 4 bytes each in UTF-8),
// so 20kb is enough and keeps oversized bodies out.
router.use(express.json({ limit: '20kb' }));

// POST /api/analyze  { "text": "Aqua, Niacinamide, ..." }  ->  { "actives": [...] }
// Open to everyone: no login, no session, no database.
router.post('/analyze', (req, res) => {
  const { status, body } = analyzeRequest(req.body);
  res.status(status).json(body);
});

// Anything else under /api answers in JSON, not with the HTML error page.
router.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large.' });
  }
  if (err.type === 'entity.parse.failed' || err.status === 400) {
    return res.status(400).json({ error: 'Request body must be valid JSON.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

module.exports = router;
