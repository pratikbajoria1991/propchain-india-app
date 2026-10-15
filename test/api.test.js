// Zero-dependency API test suite for PropChain India.
// Spins up server.js on a throwaway port with a temp waitlist file, exercises
// every endpoint and edge case, prints a report, and exits non-zero on failure.
//   node test/api.test.js
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const PORT = 5899;
const BASE = `http://127.0.0.1:${PORT}`;
const TMP_WAITLIST = path.join(os.tmpdir(), `pc-waitlist-${Date.now()}.json`);
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

function req(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = body !== undefined ? JSON.stringify(body) : null;
    const r = http.request(BASE + pathname, {
      method,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, json, raw });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function waitForServer(tries = 50) {
  return new Promise((resolve, reject) => {
    const attempt = n => {
      http.get(BASE + '/api/health', res => { res.resume(); resolve(); })
        .on('error', () => { if (n <= 0) reject(new Error('server never came up')); else setTimeout(() => attempt(n - 1), 100); });
    };
    attempt(tries);
  });
}

async function run() {
  const email = `test+${Date.now()}@propchain.test`;

  console.log('\nHealth');
  let r = await req('GET', '/api/health');
  check('GET /api/health → 200', r.status === 200, `got ${r.status}`);
  check('health ok:true', r.json && r.json.ok === true);
  check('health reports a store backend', r.json && typeof r.json.store === 'string', r.json && r.json.store);

  console.log('\nProperties');
  r = await req('GET', '/api/properties');
  check('GET /api/properties → 200', r.status === 200, `got ${r.status}`);
  check('properties ok:true', r.json && r.json.ok === true);
  check('returns 3 listings', r.json && r.json.properties && r.json.properties.length === 3, r.json && r.json.count);
  const p = r.json && r.json.properties && r.json.properties[0];
  check('listing has required fields', p && p.id && p.name && p.city && typeof p.target_yield_pct === 'number');
  check('every listing flagged illustrative', r.json.properties.every(x => x.illustrative === true));
  check('payload carries a disclaimer', r.json.illustrative === true && /pre-launch/i.test(r.json.disclaimer || ''));
  check('no funding/sold-out claims in payload', !/fractions_sold|sold_out|min_investment/.test(r.raw));
  check('properties sends nosniff header', r.headers['x-content-type-options'] === 'nosniff');
  r = await req('POST', '/api/properties', {});
  check('POST /api/properties → 405', r.status === 405, `got ${r.status}`);

  console.log('\nWaitlist — validation');
  r = await req('POST', '/api/waitlist', { email: 'not-an-email', consent: true });
  check('invalid email → 422', r.status === 422, `got ${r.status}`);
  r = await req('POST', '/api/waitlist', {});
  check('missing email → 422', r.status === 422, `got ${r.status}`);
  r = await req('POST', '/api/waitlist', { email: 'ok@propchain.test' });
  check('missing consent → 422', r.status === 422, `got ${r.status}`);
  r = await req('POST', '/api/waitlist', { email: 'ok@propchain.test', consent: 'yes' });
  check('non-boolean consent → 422', r.status === 422, `got ${r.status}`);
  r = await req('GET', '/api/waitlist');
  check('GET /api/waitlist → 405', r.status === 405, `got ${r.status}`);

  console.log('\nWaitlist — capture + de-dupe');
  r = await req('POST', '/api/waitlist', { email, interest: 'test', consent: true });
  check('valid email → 200', r.status === 200, `got ${r.status}`);
  check('first submit ok:true', r.json && r.json.ok === true);
  check('first submit not duplicate', r.json && r.json.duplicate === false);
  r = await req('POST', '/api/waitlist', { email, interest: 'test', consent: true });
  check('duplicate email → 200', r.status === 200, `got ${r.status}`);
  check('second submit flagged duplicate', r.json && r.json.duplicate === true);
  const saved = fs.existsSync(TMP_WAITLIST) ? JSON.parse(fs.readFileSync(TMP_WAITLIST, 'utf8')) : [];
  const rec = saved.find(e => e.email === email);
  check('entry persisted to file', !!rec);
  check('consent recorded with entry', rec && rec.consent === true && !!rec.consent_version);
  check('raw IP / user-agent NOT stored', rec && !('ip' in rec) && !('ua' in rec) && /^[0-9a-f]{16}$/.test(rec.ip_hash || ''));

  console.log('\nWaitlist — security');
  r = await req('POST', '/api/waitlist', { email: 'bot@spam.test', company: 'ACME Corp', consent: true });
  check('honeypot filled → 200 silently', r.status === 200);
  check('honeypot entry NOT stored', !JSON.parse(fs.readFileSync(TMP_WAITLIST, 'utf8')).some(e => e.email === 'bot@spam.test'));
  r = await req('POST', '/api/waitlist', { email, consent: true });
  check('waitlist sends no-store header', r.headers['cache-control'] === 'no-store');

  console.log('\nWaitlist — rate limiting');
  let got429 = false;
  for (let i = 0; i < 12; i++) { const rr = await req('POST', '/api/waitlist', { email: `burst${i}@propchain.test`, consent: true }); if (rr.status === 429) got429 = true; }
  check('burst triggers 429', got429);

  console.log('\nStatic files');
  r = await req('GET', '/');
  check('GET / → 200', r.status === 200, `got ${r.status}`);
  check('/ is html', (r.headers['content-type'] || '').includes('text/html'));
  check('/ sends nosniff', r.headers['x-content-type-options'] === 'nosniff');
  r = await req('GET', '/robots.txt');
  check('GET /robots.txt → 200', r.status === 200);
  check('robots disallows /api/', r.raw.includes('Disallow: /api/'));
  r = await req('GET', '/og.jpg');
  check('GET /og.jpg → 200 image', r.status === 200 && (r.headers['content-type'] || '').includes('image/jpeg'));
  r = await req('GET', '/assets/vid/city-m.mp4');
  check('portrait mobile clip served', r.status === 200 && (r.headers['content-type'] || '').includes('video/mp4'));
  r = await req('GET', '/assets/photo_city.jpg');
  check('raw source photos not shipped', r.status === 404, `got ${r.status}`);
  r = await req('GET', '/');
  check('page has disclosures dialog', r.raw.includes('id="pcInfo"') && /not an offer/i.test(r.raw));
  check('page has consent checkbox', r.raw.includes('id="pcConsent"'));
  check('page makes no SEBI-compliance claim', !/sebi[- ]compliant|sebi[- ]ready|sebi[- ]approved/i.test(r.raw));
  check('page has no unverified market-size figure', !/lakh crore/i.test(r.raw));
  check('page canonical + absolute og:image', r.raw.includes('rel="canonical"') && /og:image" content="https:\/\//.test(r.raw));
  r = await req('GET', '/sitemap.xml');
  check('GET /sitemap.xml → 200', r.status === 200);
  r = await req('GET', '/this-page-does-not-exist');
  check('unknown path → 404', r.status === 404, `got ${r.status}`);
  check('404 serves branded page', r.raw.includes('404'));

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`);
  if (fail) { console.log('Failures:\n  - ' + fails.join('\n  - ')); }
  return fail === 0;
}

const server = spawn(process.execPath, ['server.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), WAITLIST_FILE: TMP_WAITLIST },
  stdio: ['ignore', 'ignore', 'inherit'],
});

(async () => {
  let ok = false;
  try {
    await waitForServer();
    ok = await run();
  } catch (e) {
    console.error('Test harness error:', e.message);
  } finally {
    server.kill();
    try { fs.unlinkSync(TMP_WAITLIST); } catch (e) {}
    process.exit(ok ? 0 : 1);
  }
})();
