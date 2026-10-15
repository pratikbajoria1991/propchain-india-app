// Pluggable waitlist store. Picks a backend from the environment so the same
// code is production-ready on Vercel and runs locally with zero setup:
//
//   1. Vercel KV / Upstash Redis   — if KV_REST_API_URL + KV_REST_API_TOKEN set
//      (provision "KV" in the Vercel dashboard; env vars auto-inject). Durable,
//      shared across all serverless instances, with de-duplication.
//   2. Outbound webhook            — if WAITLIST_WEBHOOK_URL set (Google Apps
//      Script, Zapier/Make, or your own CRM endpoint). The entry is POSTed as JSON.
//   3. Local JSON file             — fallback for `node server.js` on your machine.
//
// Every backend is best-effort and never throws into the request handler.
const fs = require('fs');
const path = require('path');

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const WEBHOOK = process.env.WAITLIST_WEBHOOK_URL;

function backend() {
  if (KV_URL && KV_TOKEN) return 'kv';
  if (WEBHOOK) return 'webhook';
  return 'file';
}

// --- Vercel KV (Upstash Redis REST) --------------------------------------
async function kvCmd(cmd) {
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error(`KV ${r.status}`);
  return (await r.json()).result;
}

async function kvSave(entry) {
  // De-dupe on email via a set; keep full entries in a list.
  const added = await kvCmd(['SADD', 'waitlist:emails', entry.email]);
  if (added === 1) await kvCmd(['RPUSH', 'waitlist:entries', JSON.stringify(entry)]);
  return { stored: true, duplicate: added === 0 };
}

// --- Outbound webhook -----------------------------------------------------
async function webhookSave(entry) {
  const r = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  if (!r.ok) throw new Error(`webhook ${r.status}`);
  return { stored: true, duplicate: false };
}

// --- Local file -----------------------------------------------------------
function fileSave(entry) {
  const file = process.env.WAITLIST_FILE || path.join(__dirname, '..', 'data', 'waitlist.json');
  let list = [];
  try { if (fs.existsSync(file)) list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {}
  const duplicate = list.some(e => e.email === entry.email);
  if (!duplicate) { list.push(entry); fs.writeFileSync(file, JSON.stringify(list, null, 2)); }
  return { stored: true, duplicate };
}

async function saveEntry(entry) {
  const b = backend();
  try {
    if (b === 'kv') return await kvSave(entry);
    if (b === 'webhook') return await webhookSave(entry);
    return fileSave(entry);
  } catch (err) {
    // Never lose a lead to a flaky sink: log it so it is recoverable from logs.
    console.error(`[waitlist] ${b} store failed:`, err.message, '| entry:', JSON.stringify(entry));
    return { stored: false, duplicate: false, error: true };
  }
}

module.exports = { saveEntry, backend };
