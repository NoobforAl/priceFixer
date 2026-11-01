# Price Fixer

Chrome/Firefox extension (Manifest V3, TypeScript, webpack) that finds charm
prices on web pages and shows them rounded up: **$5.99 is $6, not $5.**

## Rules for working in this repo

1. **Run tasks through `make`, never by hand.** Don't type `npm run …`, `npx …`,
   `jest`, `eslint`, `tsc`, `webpack` or `web-ext` directly. Each task has a
   target (`make help` lists them), and the targets chain the steps the raw
   commands skip (e.g. `make firefox` builds first; `make check` runs everything
   CI runs). If something you need has no target, add one to the `Makefile` (and
   an npm script if needed) rather than running it ad hoc.
2. **Before saying a change works, run `make check`.** It runs type-check, lint,
   format check, unit tests, Mozilla's add-on linter and both builds. Fix
   formatting with `make format`, not by hand.
3. **Domains and selectors are data, not code.** Shops go in
   `src/config/shops.json`, payment / bank / trading / tax sites in
   `src/config/protected-sites.json`. Don't hard-code lists in TypeScript.
4. **Touching the scan loop in `priceFixerContent.ts`?** Run `make bench` before
   and after.
5. **Version numbers** live in four files; change them only with
   `make version V=x.y.z`.

## Commands

| Task                         | Command                         |
| ---------------------------- | ------------------------------- |
| Install dependencies         | `make install`                  |
| Everything before a commit   | `make check`                    |
| Unit tests only              | `make test`                     |
| Fix lint + formatting        | `make format`                   |
| Try it in real Firefox       | `make firefox`                  |
| Watch build (Chrome/Firefox) | `make dev` / `make dev-firefox` |
| Performance benchmarks       | `make bench`                    |
| Release zips                 | `make package`                  |
| Bump version                 | `make version V=1.5.0`          |

## Where things are

```
src/background/   service worker (shortcut, inject into open tabs)
src/content/      page engine: PriceFixerContent, custom rules
src/pricing/      price detection, charm rule, rounding, formatting
src/sites/        domain matching, known shops, site guard (blocklist + protected pages)
src/config/       shops.json, protected-sites.json + JSON Schemas
tests/unit/       Jest + jsdom    tests/bench/  benchmarks    tests/manual/  test page
popup.*, options.*, ui-common.js, ui.css   plain-JS extension pages (not bundled)
manifest.json / manifest.firefox.json       Chrome / Firefox manifests
```

## Things that bite

- **`regex` library:** plain `( )` groups silently become `(?: )`. Capture
  amounts as `(?<amount> … )`. Every price pattern is anchored on a currency
  symbol or code; never add unanchored number patterns (they rewrote dates,
  phone numbers, "15 days", "Save 25%").
- **Restore must be exact.** Every DOM change is recorded (`ProcessedRecord`)
  and `restoreOriginal()` only removes what the extension inserted. Don't edit
  page nodes outside that mechanism.
- **Our own DOM edits trigger the MutationObserver.** Call
  `observer.takeRecords()` after editing, as the existing code does.
- **Highlight mode keeps `textContent` = the honest price**, so site scripts
  that parse prices keep working. The listed price lives in `data-pf-original`.
- **Shadow DOM is not scanned** (known limitation, documented by a test).
- **ESLint layout rules** (braces always, blank line after blocks / declarations
  / before `return`) sit _after_ `eslint-config-prettier` in `eslint.config.js`,
  because it turns `curly` off.
- **Firefox MV3** doesn't grant host permissions until the user allows the site;
  the popup's "Enable on this site" does that.

## Rounding rule (default)

Only charm prices change: any fractional amount → next whole unit
(`$5.49 → $6`); a whole amount of 2+ digits ending in 9 → +1 (`$199 → $200`),
also after dropping trailing `000` groups (`999,000 → 1,000,000`). `$9`,
`$12.00`, `$101` stay. Output keeps the page's separators, digit script and
grouping. A user-set rounding step replaces this rule for every price (always
strictly higher).

## More detail

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): engine internals, split prices,
  performance, storage keys, site guard, messaging, currencies, CI
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md): setup, tests, adding shops
- [docs/RELEASING.md](docs/RELEASING.md): version, tag, store publishing
