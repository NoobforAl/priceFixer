// `make firefox`: serve the manual test page and open Firefox with the built
// extension (dist-firefox/) loaded. web-ext reloads the extension whenever
// dist-firefox/ changes, so `make dev-firefox` in another terminal gives live
// reload. Set FIREFOX to the Firefox binary when it isn't on PATH.
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const server = spawn(process.execPath, [path.join(__dirname, 'dev-server.js'), '--no-open'], {
  stdio: 'inherit',
});

const webExt = path.join(root, 'node_modules', 'web-ext', 'bin', 'web-ext.js');
const args = [
  webExt,
  'run',
  '--source-dir',
  'dist-firefox',
  '--start-url',
  'http://localhost:3456/',
  '--firefox',
  process.env.FIREFOX || 'firefox',
];
const firefox = spawn(process.execPath, args, { cwd: root, stdio: 'inherit' });

const stop = () => server.kill();

firefox.on('exit', code => {
  stop();
  process.exit(code ?? 0);
});
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
