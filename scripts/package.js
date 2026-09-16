/**
 * Zip the built extensions for distribution:
 *   dist/          → price-fixer-chrome.zip
 *   dist-firefox/  → price-fixer-firefox.zip
 * Run `npm run build:all` first (or `npm run package`, which does both).
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const targets = [
  ['dist', 'price-fixer-chrome.zip'],
  ['dist-firefox', 'price-fixer-firefox.zip'],
];

for (const [dir, zip] of targets) {
  const src = path.join(root, dir);
  const out = path.join(root, zip);
  if (!fs.existsSync(path.join(src, 'manifest.json'))) {
    console.error(`${dir}/manifest.json not found — run "npm run build:all" first`);
    process.exit(1);
  }
  fs.rmSync(out, { force: true });
  if (process.platform === 'win32') {
    // bsdtar ships with Windows 10+ and writes zip files (use the system one,
    // not Git's GNU tar, which misreads "B:\..." as a remote host)
    const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    execFileSync(tar, ['-a', '-c', '-f', out, '.'], { cwd: src, stdio: 'inherit' });
  } else {
    execFileSync('zip', ['-qr', out, '.'], { cwd: src, stdio: 'inherit' });
  }
  console.log(`${zip}  ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}
