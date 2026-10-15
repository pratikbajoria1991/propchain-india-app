// Local dev server — zero dependencies.
// Serves ./public as static files and routes /api/* to the same handler
// modules Vercel deploys as serverless functions.
//   node server.js   →  http://localhost:5890
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5891;
const PUB = path.join(__dirname, 'public');

// Mirror the production security headers from vercel.json so local == prod
// (and so the CSP is exercised during local testing, not just after deploy).
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'";
function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Content-Security-Policy', CSP);
}
const API = {
  '/api/properties': require('./api/properties.js'),
  '/api/waitlist': require('./api/waitlist.js'),
  '/api/health': require('./api/health.js'),
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

  // Try the path as-is, then with .html (cleanUrls parity with Vercel).
  let rel = route === '/' ? 'index.html' : route.replace(/^\/+/, '');
  let file = path.normalize(path.join(PUB, rel));
  if (!file.startsWith(PUB)) { res.statusCode = 403; return res.end('Forbidden'); }

  const serve = f => fs.readFile(f, (err, buf) => {
    if (err) {
      // SPA-style fallback to a 404 page if present, else plain 404.
      return fs.readFile(path.join(PUB, '404.html'), (e2, nf) => {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(e2 ? 'Not found' : nf);
      });
    }
    res.statusCode = 200;
    const ext = path.extname(f).toLowerCase();
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.setHeader('Accept-Ranges', 'bytes');
    securityHeaders(res);
    if (ext === '.html') res.setHeader('Cache-Control', 'no-cache');
    else if (f.includes(path.sep + 'assets' + path.sep)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(buf);
  });

  fs.stat(file, (err, st) => {
    if (!err && st.isFile()) return serve(file);
    if (!err && st.isDirectory()) return serve(path.join(file, 'index.html'));
    if (!path.extname(file)) return serve(file + '.html'); // cleanUrls
    serve(file); // will 404 via serve()
  });
}).listen(PORT, () => console.log(`propchain-app running → http://localhost:${PORT}`));
