#!/usr/bin/env node
/**
 * Report CSS that no extension page uses: unused selectors and unused
 * custom properties (CSS variables).
 *
 * Each stylesheet is checked against the pages that can load it:
 *   ui.css               → popup + options pages and their scripts
 *   <style> in popup     → popup.html, popup.js, ui-common.js
 *   <style> in options   → options.html, options.js, ui-common.js
 *
 * PurgeCSS finds class names, ids and tags as plain words in those files, so
 * classes set from JS ("item.className = 'list-item'") count as used. A
 * class built from pieces at runtime would not be found: add it to SAFELIST.
 *
 * Exits 1 when something unused is found.
 */
const fs = require('fs');
const path = require('path');
const { PurgeCSS } = require('purgecss');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

/** Selectors that are used but cannot be found by a text scan. */
const SAFELIST = {
  // Browser state, not markup: PurgeCSS drops a bare pseudo-class selector.
  standard: [':focus-visible'],
};

const POPUP = ['popup.html', 'popup.js', 'ui-common.js'];
const OPTIONS = ['options.html', 'options.js', 'ui-common.js'];
const ALL_PAGES = [...new Set([...POPUP, ...OPTIONS])];

/** CSS inside the <style> blocks of an HTML page. */
function inlineStyles(file) {
  return [...read(file).matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
}

const checks = [
  { name: 'ui.css', css: read('ui.css'), content: ALL_PAGES },
  { name: 'popup.html <style>', css: inlineStyles('popup.html'), content: POPUP },
  { name: 'options.html <style>', css: inlineStyles('options.html'), content: OPTIONS },
];

/** Selectors in `css` that none of the `content` files use. */
async function unusedSelectors(css, content) {
  const [result] = await new PurgeCSS().purge({
    css: [{ raw: css }],
    content: content.map(file => ({ raw: read(file), extension: path.extname(file).slice(1) })),
    safelist: SAFELIST,
    // set as `root.dataset.theme` in ui-common.js, never written as "data-theme"
    dynamicAttributes: ['data-theme'],
    rejected: true,
  });

  return result.rejected || [];
}

/**
 * Custom properties that are defined (`--name:`) but never read with
 * `var(--name)` in any stylesheet, page or script.
 */
function unusedVariables() {
  const sources = ['ui.css', ...ALL_PAGES].map(read).join('\n');
  const defined = new Set([...sources.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));

  return [...defined].filter(name => !sources.includes(`var(${name}`));
}

function report(name, items) {
  console.log(`${name}: ${items.length ? `${items.length} unused` : 'all used'}`);
  for (const item of items) {
    console.log(`  ${item}`);
  }

  return items.length;
}

async function main() {
  let unused = 0;

  for (const check of checks) {
    unused += report(check.name, await unusedSelectors(check.css, check.content));
  }

  unused += report('CSS variables', unusedVariables());

  if (unused > 0) {
    console.log(
      `\n${unused} unused. Remove them, or add to SAFELIST in ${path.basename(__filename)} if set dynamically.`
    );
    process.exit(1);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
