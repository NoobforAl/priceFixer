#!/usr/bin/env node
/**
 * List dependencies that have newer versions, split into:
 *   - safe updates: newer version inside the range in package.json
 *     (same major), applied by `npm update --save`;
 *   - major updates: need a deliberate upgrade and a look at the changelog.
 *
 * Writes a Markdown report to stdout, to $GITHUB_STEP_SUMMARY when set (CI),
 * and to the file given with `--out <file>` (the CI job turns it into an
 * issue). Prints nothing to stdout but "up to date" when nothing is newer.
 *
 * Always exits 0 when the check itself worked: outdated packages are a
 * report, not a failure. Exits 1 only when npm could not be queried.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');

/** Majors that are held back on purpose, with the reason shown in the report. */
const HOLD_MAJOR = {
  '@types/node': `follows the Node version in .nvmrc (${readNodeMajor()})`,
};

function readNodeMajor() {
  try {
    return fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim();
  } catch {
    return 'unknown';
  }
}

const major = version => Number(String(version).split('.')[0]);

/** `npm outdated --json`; npm exits 1 whenever something is outdated, so read stdout anyway. */
function npmOutdated() {
  let output;

  try {
    // A fixed command string: runs through the shell, so `npm` resolves to
    // npm.cmd on Windows without passing arguments to a shell.
    output = execSync('npm outdated --json', {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (typeof error.stdout !== 'string' || !error.stdout.trim()) {
      throw error;
    }

    output = error.stdout;
  }

  const result = JSON.parse(output || '{}');

  if (result.error) {
    throw new Error(result.error.summary || 'npm outdated failed');
  }

  return result;
}

function table(rows, columns) {
  return [
    `| ${columns.join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${row.join(' | ')} |`),
  ].join('\n');
}

function buildReport(outdated) {
  const safe = [];
  const majors = [];
  const held = [];

  for (const [name, info] of Object.entries(outdated).sort(([a], [b]) => a.localeCompare(b))) {
    const current = info.current || '(not installed)';

    if (info.wanted && info.wanted !== info.current) {
      safe.push([`\`${name}\``, current, info.wanted]);
    }

    if (info.latest && major(info.latest) > major(info.wanted || info.current)) {
      const target = HOLD_MAJOR[name] ? held : majors;

      target.push([`\`${name}\``, current, info.latest, HOLD_MAJOR[name] || '']);
    }
  }

  if (safe.length === 0 && majors.length === 0) {
    return null;
  }

  const parts = ['## Package updates available'];

  if (safe.length > 0) {
    parts.push(
      `### Safe updates (${safe.length})`,
      'Inside the current major version. Apply with `npm update --save`, then `make check`.',
      table(safe, ['Package', 'Current', 'Update to'])
    );
  }

  if (majors.length > 0) {
    parts.push(
      `### Major updates (${majors.length})`,
      'May contain breaking changes: read the changelog and upgrade one at a time.',
      table(
        majors.map(row => row.slice(0, 3)),
        ['Package', 'Current', 'Latest']
      )
    );
  }

  if (held.length > 0) {
    parts.push(
      `### Held back on purpose (${held.length})`,
      table(held, ['Package', 'Current', 'Latest', 'Why'])
    );
  }

  return `${parts.join('\n\n')}\n`;
}

function main() {
  const outIndex = process.argv.indexOf('--out');
  const outFile = outIndex > 0 ? process.argv[outIndex + 1] : null;
  const report = buildReport(npmOutdated());

  if (outFile) {
    fs.writeFileSync(outFile, report || '');
  }

  if (!report) {
    console.log('All packages are up to date.');

    return;
  }

  console.log(report);

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  }
}

try {
  main();
} catch (error) {
  console.error(`Could not check for updates: ${error.message}`);
  process.exit(1);
}
