# Price Fixer - Browser Extension

## Project Overview

Chrome/Firefox browser extension (Manifest V3) that detects psychological/charm
pricing on web pages and exposes it by rounding prices up. $5.99 is $6, not $5.
Written in TypeScript, bundled with Webpack.

## Tech Stack

- **Language**: TypeScript 6 (strict mode, ES2020 target)
- **Bundler**: Webpack 5 (entry points: `src/background.ts`, `src/content.ts`)
- **Testing**: Jest 30 with jsdom environment, ts-jest
- **Linting**: ESLint 10 (flat config `eslint.config.js`) + typescript-eslint
  8 + Prettier 3.8. `npm run lint` / `format:check` cover `src/`, the plain-JS
  pages (`popup.js`, `options.js`, `ui-common.js`) and `scripts/`.
- **Regex**: Uses `regex` npm package for readable tagged template patterns
- **Git hooks**: Husky 9 + lint-staged 17 (pre-commit: eslint --fix + prettier)

## Key Commands

```bash
npm run dev            # Webpack watch mode (development, Chrome)
npm run dev:firefox    # Webpack watch mode (development, Firefox)
npm run build          # Production build to dist/ (Chrome)
npm run build:firefox  # Production build to dist-firefox/ (Firefox)
npm run build:all      # Build both Chrome + Firefox
npm run package        # Build both + zip as price-fixer-{chrome,firefox}.zip
npm test               # Run Jest tests
npm run validate       # Type-check + lint + format-check + test (full CI check)
npm run lint:fix       # Auto-fix lint issues
npm run format         # Auto-format code
npm run type-check     # tsc --noEmit
npm run bench          # Scan/mutation/rescan timings on a 3,000-card synthetic page (jsdom)
npm run dev:test       # Build Chrome + open test page at localhost:3456
npm run dev:test:firefox  # Build Firefox + open test page
```

## Architecture

### Source Files (`src/`)

- `content.ts` - Content script bootstrap only (creates one `PriceFixerContent`,
  tears it down on `pagehide`).
- `priceFixerContent.ts` - The page engine. `PriceFixerContent` class:
  - **Highlight mode** (default):
    `<span class="pf-highlight" data-pf-original="$5.99">$6</span>`. Only the
    honest price is rendered (highlighted); the listed price and the difference
    appear in one shared fixed-position tooltip (`#pf-tooltip`) on hover.
    `textContent` is just the honest price, so site JS that parses price text
    keeps working. Styles go through `adoptedStyleSheets` (CSP-proof) with
    `!important` everywhere.
  - **Replace mode**: silently swaps the text.
  - Every change is a `ProcessedRecord` (`originals` / `inserted` nodes).
    `restoreOriginal()` re-inserts the originals in front of the inserted nodes
    and removes only what we added — never touches sibling nodes.
  - **Split prices**: "compact" elements (≤40 chars of text, child elements,
    currency marker) are scanned as one string mapped back to text nodes.
    Screen-reader-only nodes (Amazon `.a-offscreen`) are processed separately,
    never merged. A price spanning several nodes is swapped as a unit when the
    common ancestor holds only that price (keeps Amazon's styling); otherwise
    the node carrying the digits hosts the new price and the other covered nodes
    are emptied (Walmart `Now`/`$`/`11`/`87`). Every original keeps its
    parent/next-sibling (`Placement`) so restore is exact.
  - **Icon currencies**: a bare grouped Persian/Arabic-digit amount next to an
    `<svg>`/`<img>` (Digikala's Toman icon) is a price; ASCII digits count too
    on `lang=fa/ar` or `dir=rtl` pages.
  - Skips `SKIP_TAGS` (script/style/code/pre/select/option/svg/…),
    `contenteditable`, and our own nodes. MutationObserver handles dynamic
    content; `observer.takeRecords()` after our own DOM edits stops feedback.
  - **Performance**: the page scan is an explicit stack (`scanNode`) run in ~12
    ms slices — the first slice is synchronous, the rest yield via
    `requestIdleCallback`; `restoreOriginal()`/`processPage()` bump
    `scanGeneration` to cancel a pending scan. Ancestor checks (`closest`) run
    only at a walk's root (`root` flag), never per descendant. The
    screen-reader-hidden check (`getComputedStyle` + `getBoundingClientRect`,
    forces layout) runs only for compact elements holding a complete price next
    to other digit nodes, after cheap class/attribute checks, cached per parent.
    Measure with `npm run bench` before touching any of this.
  - Settings in `storage.sync` (`globalEnabled`, `displayMode`,
    `siteSettings[domain]`), stats in `storage.local`, and a per-site **session
    pause** in `storage.session` (`pausedSites`): after "Show originals" the
    site stays untouched until Rescan / re-enable.
- `siteGuard.ts` - Blocklist and payment-page detection.
  `storage.sync.blockedSites` (domains + subdomains, edited from popup →
  Security) and `storage.sync.pauseOnPayment` (default on): payment gateways by
  host, checkout URLs by whole path segment / subdomain label, card forms by
  `cc-*` autocomplete, card `name`/`id` fields and gateway iframes. The content
  script re-checks on URL change and (throttled to 1/s) on mutations, so
  single-page checkouts are restored when the card form appears.
- `customRules.ts` - User rules from `storage.sync.customRules` (popup → Rules):
  per-site/global exclude selectors, exclude regexes, extra price regexes (must
  capture `(?<amount>…)`). Compiled per page; errors reported in
  `getStatus().ruleErrors`.
- `background.ts` - Service worker. Keyboard shortcut (`Ctrl+Shift+P`), injects
  `content.js` into already-open tabs on install/update.
- `pricePatterns.ts` - `PricePatterns`: `findPrices()`, `isCharmPrice()`,
  `roundUpPrice()`, `priceDifference()`, `formatPrice()`. Format-preserving
  output (European vs American number formats, Persian/Arabic digits).
- `regex-patterns.ts` - Patterns built with the `regex` library. **The library
  is named-capture-only: plain `( )` groups silently become `(?: )`.** Every
  amount is captured as `(?<amount> … )`. All patterns are anchored on a
  currency symbol or ISO code; unanchored number patterns are deliberately
  absent (they rewrote dates, phone numbers, "15 days", "Save 25%").

### Non-bundled Files

- `icons/icon.svg` - Source of every icon size. Regenerate the PNGs by rendering
  the SVG at 16/32/48/128 (`icons/icon-<size>.png`); `icons/icon.png` is the
  512px store asset and is not shipped.
- `screenshots/` - README images captured from Firefox (`00`–`10`).
- `scripts/package.js` - `npm run package`: builds both targets and zips them
  (bsdtar on Windows, `zip` elsewhere). CI uses it.
- `popup.html` / `popup.js` - Extension popup UI (vanilla JS). Dark card design
  with mode toggle, per-site enable/disable, stats dashboard, changes list.
- `options.html` / `options.js` - Full-page settings (`options_ui`,
  `open_in_tab`), opened from the popup's **Settings** button via
  `runtime.openOptionsPage()`. Reads/writes `storage.sync` directly; content
  scripts follow through `storage.onChanged`. Adds what the popup can't show:
  every `siteSettings` entry, rules for any domain, reset stats/settings.
- `ui-common.js` - `api` / `isPromiseApi` detection and `normalizeDomain()`,
  loaded as globals by both pages.
- `manifest.json` - Chrome Manifest V3.
- `manifest.firefox.json` - Firefox Manifest V3 (uses `background.scripts`
  instead of `service_worker`).
- `eslint.config.js` - ESLint flat config (v10).

### Build Output

- `dist/` - Chrome build. Load in Chrome as unpacked extension.
- `dist-firefox/` - Firefox build. Load in Firefox via `about:debugging`.

## Rounding Rules

Only charm prices are touched; everything else is left exactly as is.

- Any fractional amount → next whole unit: `$5.99 → $6`, `$5.49 → $6`,
  `$149.99 → $150`, `€1.299,99 → €1.300`
- Whole amount of 2+ digits ending in 9 → +1: `$19 → $20`, `$199 → $200`
- Same after dropping trailing all-zero thousand groups:
  `۱٬۲۹۹٬۰۰۰ تومان → ۱٬۳۰۰٬۰۰۰`, `999,000 → 1,000,000`
- Not charm, unchanged: `$9`, `$12.00`, `$101`, `$500.00`, `¥2,980`, `9,000`

Output keeps the original separators (`1.299,99`, `1 299`, `۱٬۲۹۹`), digit
script (Persian/Arabic-Indic) and grouping style (`RMB 9999 → RMB 10000`).

## Testing

`jest.config.js` (ts-jest + jsdom). Tests live in `src/__tests__/`:
`pricePatterns.test.ts` (detection, rounding, formatting, negative cases),
`content.test.ts` (highlight/replace/restore/split prices/observer/site guard),
`siteGuard.test.ts` and `customRules.test.ts`. For a real browser check:
`npm run build:firefox`, then
`npx web-ext run --source-dir dist-firefox --start-url http://localhost:3456/`
with `node scripts/dev-server.js` running. Firefox MV3 does not grant
`host_permissions` until the user allows the site; the popup offers "Enable on
this site" for that.

## Supported Currencies

Symbols
($ € £ ¥ ￥ ₹ ₽ ₩ ₺ ₪ ₫ … ﷼), ISO codes ("299 EUR", "USD 12.99", "RMB
5999"), prefix words ("Rs. 499", "US$
5") and suffix words (تومان, ریال, 元, 円, 원, zł, Kč, kr, lei, Ft, руб, грн,
TL). Persian/Arabic digits, Arabic separators (٬ ٫), European formats (1.299,99)
and space thousands (1 299) are supported. Ranges, was/now offers, subscriptions
and "starting at" phrases need no special patterns: each price in them is
matched individually and the surrounding text is preserved.

## Extension Messaging

Popup communicates with content script via `tabs.sendMessage`. Actions:
`getStatus`, `toggle`, `setGlobalEnabled`, `setSiteEnabled`, `setMode`,
`reprocess` (clears the session pause), `restore` (sets it), `setBlocked`
(`{domain?, blocked}`), `setPauseOnPayment`, `getStats`. Every action replies
with the full status object (`enabled`, `globalEnabled`, `siteEnabled`,
`sitePaused`, `siteBlocked`, `blockedSites`, `pauseOnPayment`, `paymentPage`,
`paymentReason`, `displayMode`, `processedCount`, `changes`, …). The content
script also listens to `storage.onChanged` so other tabs follow.

## CI/CD

GitHub Actions workflows in `.github/workflows/`:

- `ci.yml` - Main pipeline (lint, test, build on Node 20.x/22.x, packages via
  `scripts/package.js`)
- `pr-check.yml` - PR validation
- `security.yml` - Dependency audit + CodeQL
- `release.yml` - On `v*` tags: validate, build, attach both zips to a GitHub
  release, then publish to the Chrome Web Store / AMO when the store secrets
  (`CHROME_*`, `AMO_JWT_*`) are configured; see the file header.
