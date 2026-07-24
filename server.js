// Local dev server — zero dependencies.
// Serves ./public as static files and routes /api/* to the same handler
// modules Vercel deploys as serverless functions.
//   node server.js   →  http://localhost:5890
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5891;
const PUB = path.join(__dirname, 'public');
const API = {
  '/api/properties': require('./api/properties.js'),
  '/api/waitlist': require('./api/waitlist.js'),
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const route = url.pathname.replace(/\/$/, '') || '/';

  if (API[route]) return API[route](req, res);

  let file = path.normalize(path.join(PUB, route === '/' ? 'index.html' : route));
  if (!file.startsWith(PUB)) { res.statusCode = 403; return res.end('Forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Accept-Ranges', 'bytes');
    res.end(buf);
  });
}).listen(PORT, () => console.log(`propchain-app running → http://localhost:${PORT}`));
