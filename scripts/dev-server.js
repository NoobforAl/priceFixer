const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 3456;
const TEST_PAGE = path.join(__dirname, '..', 'test-page.html');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  const filePath = req.url === '/' ? TEST_PAGE : path.join(__dirname, '..', req.url);
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

server.listen(PORT, () => {
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
