// POST /api/waitlist — waitlist email capture.
// Portable plain-Node handler (local server.js + Vercel serverless).
// Persistence is delegated to ./_store.js, which auto-selects Vercel KV,
// an outbound webhook, or a local file depending on the environment.
const { saveEntry, backend } = require('./_store.js');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_BODY = 4096;

// Best-effort in-memory throttle (per warm instance). Real distributed rate
// limiting should use KV; this just blunts naive floods from one source.
const HITS = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 8;

function rateLimited(ip) {
  const now = Date.now();
  const rec = HITS.get(ip);
  if (!rec || now - rec.start > WINDOW_MS) { HITS.set(ip, { start: now, n: 1 }); return false; }
  rec.n += 1;
  if (HITS.size > 5000) HITS.clear(); // crude memory cap
  return rec.n > MAX_PER_WINDOW;
}

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  return (xff ? String(xff).split(',')[0] : req.socket && req.socket.remoteAddress) || 'unknown';
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body !== undefined) return resolve(req.body); // Vercel pre-parses JSON
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > MAX_BODY) { req.destroy(); reject(new Error('too large')); } });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'POST only' });

  const ip = clientIp(req);
  if (rateLimited(ip)) return send(res, 429, { ok: false, error: 'Too many requests — try again in a minute.' });

  let body;
  try { body = await readBody(req); }
  catch (e) { return send(res, 400, { ok: false, error: 'Invalid request body' }); }

  // Honeypot: real users never fill the hidden "company" field; bots do.
  if (body && String(body.company || '').trim() !== '') {
    return send(res, 200, { ok: true, message: 'You are on the list — expect an invite soon.' });
  }

  const email = String((body && body.email) || '').trim().toLowerCase();
  const interest = String((body && body.interest) || '').slice(0, 100);
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return send(res, 422, { ok: false, error: 'Enter a valid email address' });
  }

  const entry = { email, interest, at: new Date().toISOString(), ip, ua: String(req.headers['user-agent'] || '').slice(0, 300) };
  const result = await saveEntry(entry);

  if (result.error) {
    // Sink failed but the lead is in the logs — tell the user we have them.
    return send(res, 202, { ok: true, message: 'You are on the list — expect an invite soon.' });
  }
  return send(res, 200, {
    ok: true,
    duplicate: result.duplicate,
    message: result.duplicate ? 'You are already on the list — invite coming soon.' : 'You are on the list — expect an invite soon.',
  });
};

module.exports.backendName = backend;
