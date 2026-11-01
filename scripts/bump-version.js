// `make version V=1.5.0`: set the version in package.json, package-lock.json,
// manifest.json and manifest.firefox.json in one go (they must always agree).
const fs = require('fs');
const path = require('path');

const version = process.argv[2];

if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
  console.error('Usage: node scripts/bump-version.js <major.minor.patch>');
  process.exit(1);
}

const root = path.join(__dirname, '..');

for (const file of [
  'package.json',
  'manifest.json',
  'manifest.firefox.json',
  'package-lock.json',
]) {
  const full = path.join(root, file);
  const json = JSON.parse(fs.readFileSync(full, 'utf8'));

  json.version = version;

  if (file === 'package-lock.json' && json.packages && json.packages['']) {
    json.packages[''].version = version;
  }

  fs.writeFileSync(full, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`${file} -> ${version}`);
}
