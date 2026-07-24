// POST /api/waitlist — email capture.
// Portable plain-Node handler (local server.js + Vercel serverless).
// Locally, entries append to data/waitlist.json. On Vercel the filesystem is
// ephemeral — swap `persist` for Vercel KV / Postgres / a CRM webhook in prod.
const fs = require('fs');
const path = require('path');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function persist(entry) {
  try {
    const file = path.join(__dirname, '..', 'data', 'waitlist.json');
    let list = [];
    if (fs.existsSync(file)) list = JSON.parse(fs.readFileSync(file, 'utf8'));
    list.push(entry);
    fs.writeFileSync(file, JSON.stringify(list, null, 2));
    return true;
  } catch (e) {
    console.log('waitlist entry (not persisted):', JSON.stringify(entry));
    return false;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body !== undefined) return resolve(req.body); // Vercel pre-parses
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 10000) req.destroy(); });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ ok: false, error: 'POST only' }));
  }
  let body;
  try { body = await readBody(req); }
  catch (e) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
  }
  const email = String((body && body.email) || '').trim().toLowerCase();
  const interest = String((body && body.interest) || '').slice(0, 100);
  if (!EMAIL_RE.test(email)) {
    res.statusCode = 422;
    return res.end(JSON.stringify({ ok: false, error: 'Enter a valid email address' }));
  }
  persist({ email, interest, at: new Date().toISOString(), ua: req.headers['user-agent'] || '' });
  res.statusCode = 200;
  res.end(JSON.stringify({ ok: true, message: 'You are on the list — expect an invite soon.' }));
};
