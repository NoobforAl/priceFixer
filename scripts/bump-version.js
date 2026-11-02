// `make version V=1.5.0`: set the version in package.json, package-lock.json,
// manifest.json and manifest.firefox.json in one go (they must always agree).
//
// Only the "version" values are rewritten, in place: re-serializing the JSON
// would undo Prettier's layout (short arrays on one line) and fail
// `make check`. Each file is parsed again afterwards to prove the edit landed
// in the right place.
const fs = require('fs');
const path = require('path');

const version = process.argv[2];

if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
  console.error('Usage: node scripts/bump-version.js <major.minor.patch>');
  process.exit(1);
}

const root = path.join(__dirname, '..');

/** The version fields of a file; package-lock.json repeats it under packages[""]. */
function versionsOf(file, json) {
  const versions = [json.version];

  if (file === 'package-lock.json') {
    versions.push(json.packages?.['']?.version);
  }

  return versions;
}

for (const file of [
  'package.json',
  'manifest.json',
  'manifest.firefox.json',
  'package-lock.json',
]) {
  const full = path.join(root, file);
  const text = fs.readFileSync(full, 'utf8');
  const before = JSON.parse(text);
  const fields = versionsOf(file, before).length;

  // The top-level "version" (and packages[""].version in the lockfile) come
  // before any dependency entry, so they are the first matches.
  let replaced = 0;
  const updated = text.replace(/("version"\s*:\s*)"[^"]*"/g, (match, key) =>
    replaced++ < fields ? `${key}"${version}"` : match
  );

  if (versionsOf(file, JSON.parse(updated)).some(value => value !== version)) {
    console.error(`${file}: could not set the version safely, nothing written`);
    process.exit(1);
  }

  fs.writeFileSync(full, updated);
  console.log(`${file} -> ${version}`);
}
