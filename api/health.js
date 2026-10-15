// GET /api/health — liveness + which waitlist backend is active.
const { backend } = require('./_store.js');

module.exports = (req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ ok: true, status: 'healthy', store: backend(), at: new Date().toISOString() }));
};
