const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 3456;
const HOST = '127.0.0.1';
// Only the manual test pages are served: the repo root holds .env (store
// credentials), so it must never be reachable, least of all from the LAN.
const ROOT = path.join(__dirname, '..', 'tests', 'manual');
const TEST_PAGE = path.join(ROOT, 'test-page.html');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  let urlPath;

  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    res.end('Bad request');

    return;
  }

  const filePath = urlPath === '/' ? TEST_PAGE : path.join(ROOT, urlPath);

  if (path.relative(ROOT, filePath).startsWith('..')) {
    res.writeHead(403);
    res.end('Forbidden');

    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');

      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

function openBrowser(url) {
  const platform = process.platform;
  const cmd =
    platform === 'win32'
      ? `start "" "${url}"`
      : platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;

  exec(cmd);
}

server.listen(PORT, HOST, () => {
  const url = `http://localhost:${PORT}`;

  console.log(`\n  Price Fixer - Dev Test Server`);
  console.log(`  ────────────────────────────`);
  console.log(`  Test page: ${url}`);
  console.log(`  Press Ctrl+C to stop\n`);
  console.log(`  Quick start:`);
  console.log(`  1. Load the extension in your browser:`);
  console.log(`     Chrome:  chrome://extensions → Load unpacked → dist/`);
  console.log(`     Firefox: about:debugging → Load Temporary Add-on → dist-firefox/manifest.json`);
  console.log(`  2. Navigate to ${url}`);
  console.log(`  3. Verify prices are detected and rounded\n`);

  if (!process.argv.includes('--no-open')) {
    openBrowser(url);
  }
});
