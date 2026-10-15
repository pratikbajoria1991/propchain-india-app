// Waitlist store. Picks a backend from the environment so the same code runs
// durably on Vercel and with zero setup locally:
//
//   1. Vercel Blob (private)  — BLOB_READ_WRITE_TOKEN. One JSON object per
//      email at waitlist/<sha256(email)>.json. Writes never overwrite, so the
//      second signup for an address is detected atomically as a duplicate.
//      Private store: objects are not publicly fetchable (they hold personal
//      data under India's DPDP Act, 2023).
//   2. Upstash / Vercel KV    — KV_REST_API_URL + KV_REST_API_TOKEN.
//   3. Outbound webhook       — WAITLIST_WEBHOOK_URL (Zapier, Make, Apps Script).
//   4. Local JSON file        — dev fallback (`node server.js`).
//
// saveEntry never throws into the request handler. If the sink fails the entry
// is written to the function log so the lead is recoverable.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const WEBHOOK = process.env.WAITLIST_WEBHOOK_URL;

function backend() {
  if (BLOB_TOKEN) return 'blob';
  if (KV_URL && KV_TOKEN) return 'kv';
  if (WEBHOOK) return 'webhook';
  return 'file';
}

const emailKey = email => crypto.createHash('sha256').update(email).digest('hex').slice(0, 32);

// --- Vercel Blob (private) -------------------------------------------------
async function blobSave(entry) {
  const { put } = require('@vercel/blob');
  try {
    await put(`waitlist/${emailKey(entry.email)}.json`, JSON.stringify(entry), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    return { stored: true, duplicate: false };
  } catch (err) {
    if (/already exists|allowOverwrite/i.test(String(err && err.message))) {
      return { stored: true, duplicate: true };
    }
    throw err;
  }
}

// --- Upstash / Vercel KV (REST) -------------------------------------------
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
  const added = await kvCmd(['SADD', 'waitlist:emails', entry.email]);
  if (added === 1) await kvCmd(['RPUSH', 'waitlist:entries', JSON.stringify(entry)]);
  return { stored: true, duplicate: added === 0 };
}

// --- Outbound webhook ------------------------------------------------------
async function webhookSave(entry) {
  const r = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  if (!r.ok) throw new Error(`webhook ${r.status}`);
  return { stored: true, duplicate: false };
}

// --- Local file ------------------------------------------------------------
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
    if (b === 'blob') return await blobSave(entry);
    if (b === 'kv') return await kvSave(entry);
    if (b === 'webhook') return await webhookSave(entry);
    return fileSave(entry);
  } catch (err) {
    console.error(`[waitlist] ${b} store failed:`, err.message, '| entry:', JSON.stringify(entry));
    return { stored: false, duplicate: false, error: true };
  }
}

module.exports = { saveEntry, backend, emailKey };
