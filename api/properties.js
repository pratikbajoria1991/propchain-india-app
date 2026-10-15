// GET /api/properties — live listings feed.
// Plain Node (req, res) handler: works as a Vercel serverless function and
// under the local dev server (server.js) unchanged.
const PROPERTIES = [
  {
    id: 'bkc-one',
    name: 'One BKC Tower B',
    city: 'Mumbai',
    micro_market: 'Bandra Kurla Complex',
    asset_type: 'Grade-A Office',
    target_yield_pct: 9.2,
    min_investment_inr: 10000,
    price_per_fraction_inr: 10000,
    fractions_total: 48000,
    fractions_sold: 31240,
    tenant: 'Multinational bank, 9-yr lock-in',
    status: 'open',
  },
  {
    id: 'orr-tech-park',
    name: 'Ecoworld Campus 7',
    city: 'Bengaluru',
    micro_market: 'Outer Ring Road',
    asset_type: 'IT Park Floor',
    target_yield_pct: 8.7,
    min_investment_inr: 10000,
    price_per_fraction_inr: 10000,
    fractions_total: 36000,
    fractions_sold: 36000,
    tenant: 'Global SaaS tenant, 7-yr lease',
    status: 'sold_out',
  },
  {
    id: 'cybercity-9',
    name: 'Cyber Hub Nine',
    city: 'Gurugram',
    micro_market: 'DLF Cyber City',
    asset_type: 'Grade-A Office',
    target_yield_pct: 8.9,
    min_investment_inr: 10000,
    price_per_fraction_inr: 10000,
    fractions_total: 52000,
    fractions_sold: 12980,
    tenant: 'Fortune 500 consulting firm',
    status: 'open',
  },
];

module.exports = (req, res) => {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: false, error: 'GET only' }));
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  res.end(JSON.stringify({ ok: true, count: PROPERTIES.length, properties: PROPERTIES }));
};

module.exports.PROPERTIES = PROPERTIES;
