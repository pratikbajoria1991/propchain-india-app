// GET /api/properties — illustrative example listings.
// These are NOT real offerings. PropChain India is pre-launch; the payload is
// explicitly flagged so no client can mistake it for live inventory.
// Plain Node (req, res) handler: Vercel serverless function and local server.js.
const PROPERTIES = [
  {
    id: 'example-mumbai-office',
    name: 'Grade-A office floor',
    city: 'Mumbai',
    micro_market: 'Bandra Kurla Complex',
    asset_type: 'Commercial office',
    target_yield_pct: 8.5,
    illustrative: true,
  },
  {
    id: 'example-bengaluru-itpark',
    name: 'IT park floor',
    city: 'Bengaluru',
    micro_market: 'Outer Ring Road',
    asset_type: 'IT / tech campus',
    target_yield_pct: 8.0,
    illustrative: true,
  },
  {
    id: 'example-gurugram-office',
    name: 'Grade-A office floor',
    city: 'Gurugram',
    micro_market: 'Cyber City',
    asset_type: 'Commercial office',
    target_yield_pct: 8.2,
    illustrative: true,
  },
];

const DISCLAIMER =
  'Illustrative examples only. PropChain India is pre-launch; these are not offers, listings or forecasts.';

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ ok: false, error: 'GET only' }));
  }
  res.statusCode = 200;
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.end(JSON.stringify({ ok: true, illustrative: true, disclaimer: DISCLAIMER, count: PROPERTIES.length, properties: PROPERTIES }));
};

module.exports.PROPERTIES = PROPERTIES;
