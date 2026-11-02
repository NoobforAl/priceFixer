# Development

Every task has a `make` target; `make help` lists them all. The targets wrap the
npm scripts in `package.json`, so `npm run <script>` works too, but the targets
also chain the steps (for example `make firefox` builds first).

## Setup

```bash
make install           # npm ci: exact versions from package-lock.json
```

Node 24 (LTS) or newer; `.nvmrc` pins the version CI uses. On Windows, `make`
comes with Git for Windows, Scoop (`scoop install make`) or Chocolatey.

## Everyday commands

| Command            | What it does                                                     |
| ------------------ | ---------------------------------------------------------------- |
| `make dev`         | Watch build for Chrome → `dist/`                                 |
| `make dev-firefox` | Watch build for Firefox → `dist-firefox/`                        |
| `make firefox`     | Build, then open Firefox with the extension on the test page     |
| `make dev-test`    | Build for Chrome and serve the test page at `localhost:3456`     |
| `make test`        | Jest unit tests                                                  |
| `make bench`       | Scan / mutation / rescan timings on a 3,000-card synthetic page  |
| `make format`      | Fix everything fixable: ESLint, Stylelint `--fix`, then Prettier |
| `make lint-css`    | Stylelint on `ui.css` and the pages' `<style>` blocks            |
| `make css-unused`  | CSS selectors and variables that no extension page uses          |
| `make outdated`    | Newer package versions: safe (same major) vs major updates       |
| `make validate`    | What CI runs: type-check, lint, CSS checks, format check, tests  |
| `make check`       | Before a commit: `validate` + add-on lint + both builds          |
| `make build-all`   | Production builds → `dist/` and `dist-firefox/`                  |
| `make package`     | Production builds zipped as `price-fixer-{chrome,firefox}.zip`   |

## Loading the extension

- **Chrome**: `chrome://extensions` → Developer mode → Load unpacked → `dist/`
- **Firefox**: `make firefox` opens a fresh Firefox profile with the extension
  loaded on the test page. It reloads the extension whenever `dist-firefox/`
  changes, so run `make dev-firefox` in a second terminal for live reload. If
  Firefox isn't on `PATH`, set `FIREFOX` to its binary. To load it by hand
  instead: `about:debugging#/runtime/this-firefox` → Load Temporary Add-on →
  `dist-firefox/manifest.json`.

Firefox MV3 does not grant site access automatically. If the popup says the
extension is not active on a page, click **Enable on this site**.

## Tests

- `tests/unit/`: Jest + jsdom. Price detection, rounding and formatting
  (`pricePatterns`), the DOM engine: highlight, replace, restore, split prices,
  dynamic content (`content`), site guard, custom rules, and the JSON config
  data (`config`).
- `tests/bench/`: performance benchmarks (`make bench`). Run them before and
  after touching the scan loop in `priceFixerContent.ts`.
- `tests/manual/test-page.html`: every supported format plus a "must not change"
  section, served by `make dev-test` / `make firefox`.

## Code style

ESLint and Prettier run on every commit (Husky + lint-staged) and in CI with
`--max-warnings 0`. Beyond Prettier's layout, ESLint requires:

- braces on every `if` / `else` / loop body, even one-liners;
- a blank line after a block, after declarations, and before `return`.

All of it is auto-fixed by `make format`.

CSS (`ui.css` and the `<style>` blocks in `popup.html` / `options.html`) is
checked by Stylelint (`stylelint-config-standard`, see `stylelint.config.mjs`)
and by `make css-unused`, which fails on selectors or `--variables` that no page
or script uses. A class built from pieces at runtime cannot be found by that
scan: add it to `SAFELIST` in `scripts/check-unused-css.js`.

The build does not minify CSS or JS on purpose: zipped, minified CSS saves under
1 KB, and AMO asks for the source code of minified files, which the release job
does not upload.

## Adding a shop or a protected site

Edit `src/config/shops.json` or `src/config/protected-sites.json`; no code
changes are needed. Editors that understand `$schema` (VS Code does)
autocomplete the fields and flag mistakes, and `make test` rejects bad domains,
duplicates and selectors that don't parse.

A shop:

```json
{
  "name": "Example Shop",
  "category": "fashion",
  "domains": ["exampleshop.com", "exampleshop.*"],
  "priceSelectors": [".product-price"],
  "skipSelectors": [".rating"]
}
```

`"shop.com"` matches the domain and its subdomains; `"shop.*"` matches it under
any country suffix (`shop.de`, `shop.co.uk`). Selectors are optional; without
them the shop only gets the popup badge.

A protected site goes into the matching `hostGroups` entry (payment gateways,
banks, brokers, crypto, accounting, tax), or a new group with its own `reason`.
The popup shows "Paused on this \<reason\> for safety".

## Project layout

```
src/
├── background/index.ts      service worker: shortcut, inject into open tabs on install
├── content/
│   ├── index.ts             content-script bootstrap
│   ├── priceFixerContent.ts page engine: scan, highlight/replace, restore, rules
│   └── customRules.ts       user rules (selectors / regexes) from storage
├── pricing/
│   ├── pricePatterns.ts     detection, charm rules, format-preserving output
│   └── regexPatterns.ts     currency patterns (regex library, named groups)
├── sites/
│   ├── domains.ts           normalise / match domains (incl. "amazon.*")
│   ├── shops.ts             known shops: popup badge + price selectors
│   └── siteGuard.ts         blocklist + protected-page detection
└── config/                  editable data, checked by tests/unit/config.test.ts
    ├── shops.json
    ├── protected-sites.json
    └── schema/              JSON Schemas (editor autocomplete + validation)
tests/                       unit/, bench/, manual/
popup.html / popup.js        toolbar popup
options.html / options.js    full-page settings
ui-common.js / ui.css        helpers, theme and styles shared by both pages
icons/icon.svg               source of every icon size
scripts/                     dev server, Firefox runner, packaging, version bump
docs/                        this file, architecture, releasing
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the engine works and
[RELEASING.md](RELEASING.md) for publishing.
