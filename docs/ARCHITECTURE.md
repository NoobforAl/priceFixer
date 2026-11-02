# Architecture

How Price Fixer works inside. For commands see [DEVELOPMENT.md](DEVELOPMENT.md).

Two webpack entry points: `src/background/index.ts` (service worker) and
`src/content/index.ts` (content script). The popup and options pages are plain
JS, copied into the build as they are. JSON in `src/config/` is bundled via
`resolveJsonModule`.

## Source files (`src/`)

Folders: `background/`, `content/` (engine), `pricing/` (detection + rounding),
`sites/` (domains, shops, site guard), `config/` (editable JSON data + JSON
Schemas). Each JSON file is assigned to a typed constant in its loader, so `tsc`
fails if the data stops matching the interface; `tests/unit/config.test.ts`
checks the data itself (domain format, duplicates, selectors parse).

- `content/index.ts` - Content script bootstrap only (creates one
  `PriceFixerContent`, tears it down on `pagehide`).
- `content/priceFixerContent.ts` - The page engine. `PriceFixerContent` class:
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
    Measure with `make bench` before touching any of this.
  - Settings in `storage.sync` (`globalEnabled`, `displayMode`, `roundingStep`,
    `siteSettings[domain]`), stats in `storage.local`, and a per-site **session
    pause** in `storage.session` (`pausedSites`): after "Show originals" the
    site stays untouched until Rescan / re-enable.
  - **Custom rounding step**: `roundingStep` (global) and
    `siteSettings[domain].roundingStep` (per-site override; `0` forces the
    default on that site) switch every matched price — not just charm prices —
    to `PricePatterns.roundToStep()`: always the next multiple of the step, even
    one already sitting on it (`1,900,000` with a `100,000` step → `2,000,000`),
    since that's the anchoring trick it exposes. `null`/unset keeps the default
    charm-only rule.
- `sites/siteGuard.ts` - Blocklist and protected-page detection. Hosts come from
  `config/protected-sites.json` in groups (payment gateways, banks, brokers,
  crypto, accounting, tax), each with the reason the popup shows ("Paused on
  this bank site for safety"), plus checkout / invoice path segments and
  card-field selectors. `storage.sync.blockedSites` (domains + subdomains,
  edited from popup → Security) and `storage.sync.pauseOnPayment` (default on):
  payment gateways by host, checkout URLs by whole path segment / subdomain
  label, card forms by `cc-*` autocomplete, card `name`/`id` fields and gateway
  iframes. The content script re-checks on URL change and (throttled to 1/s) on
  mutations, so single-page checkouts are restored when the card form appears.
- `content/customRules.ts` - User rules from `storage.sync.customRules` (popup →
  Rules): per-site/global exclude selectors, exclude regexes, extra price
  regexes (must capture `(?<amount>…)`). Compiled per page; errors reported in
  `getStatus().ruleErrors`.
- `background/index.ts` - Service worker. Keyboard shortcut (`Ctrl+Shift+P`),
  injects `content.js` into already-open tabs on install/update.
- `pricing/pricePatterns.ts` - `PricePatterns`: `findPrices()`,
  `isCharmPrice()`, `roundUpPrice()`, `roundToStep()`, `priceDifference()`,
  `formatPrice()`. Format-preserving output (European vs American number
  formats, Persian/Arabic digits).
- `pricing/regexPatterns.ts` - Patterns built with the `regex` library. **The
  library is named-capture-only: plain `( )` groups silently become `(?: )`.**
  Every amount is captured as `(?<amount> … )`. All patterns are anchored on a
  currency symbol or ISO code; unanchored number patterns are deliberately
  absent (they rewrote dates, phone numbers, "15 days", "Save 25%").
- `sites/domains.ts` - `normalizeDomain()`, `domainMatches()` (domain +
  subdomains) and `hostMatchesPattern()`, which also takes `name.*` (the label
  followed by a 1–2 label country suffix: `amazon.*` → `amazon.co.uk`).
- `sites/shops.ts` - Known shops from `config/shops.json`: `findShop()` (by
  domain, then by `pageIndicators` such as Shopify's CDN tags) gives the popup
  badge name and `getPriceElements()` the price selectors scanned before the
  full-page walk.

## Non-bundled files

- `icons/icon.svg` - Source of every icon size. Regenerate the PNGs by rendering
  the SVG at 16/32/48/128 (`icons/icon-<size>.png`); `icons/icon.png` is the
  512px store asset and is not shipped.
- `screenshots/` - README images captured from Firefox (`00`–`10`).
- `scripts/package.js` - `make package`: builds both targets and zips them
  (bsdtar on Windows, `zip` elsewhere). CI uses it.
- `popup.html` / `popup.js` - Extension popup UI (vanilla JS). Dark card design
  with mode toggle, per-site enable/disable, stats dashboard, changes list.
- `options.html` / `options.js` - Full-page settings (`options_ui`,
  `open_in_tab`), opened from the popup's **Settings** button via
  `runtime.openOptionsPage()`. Reads/writes `storage.sync` directly; content
  scripts follow through `storage.onChanged`. Adds what the popup can't show:
  every `siteSettings` entry, rules for any domain, the **Rounding** section
  (global step + per-site overrides), reset stats/settings.
- `ui-common.js` - `api` / `isPromiseApi` detection, `normalizeDomain()` and the
  theme (`storage.sync.theme`: `system` | `light` | `dark`, mirrored in
  `localStorage` so pages open in the right theme; sets `<html data-theme>`),
  loaded as globals by both pages.
- `ui.css` - Shared tokens and controls for both pages. Light by default, dark
  under `prefers-color-scheme: dark` or `data-theme="dark"`; every colour is a
  custom property, so page styles never hard-code colours.
- `manifest.json` - Chrome Manifest V3.
- `manifest.firefox.json` - Firefox Manifest V3 (uses `background.scripts`
  instead of `service_worker`).
- `eslint.config.js` - ESLint flat config (v10).

## Build output

- `dist/` - Chrome build. Load in Chrome as unpacked extension.
- `dist-firefox/` - Firefox build. Load in Firefox via `about:debugging`.

## Rounding rules

Only charm prices are touched; everything else is left exactly as is.

- Any fractional amount → next whole unit: `$5.99 → $6`, `$5.49 → $6`,
  `$149.99 → $150`, `€1.299,99 → €1.300`
- Whole amount of 2+ digits ending in 9 → +1: `$19 → $20`, `$199 → $200`
- Same after dropping trailing all-zero thousand groups:
  `۱٬۲۹۹٬۰۰۰ تومان → ۱٬۳۰۰٬۰۰۰`, `999,000 → 1,000,000`
- Not charm, unchanged: `$9`, `$12.00`, `$101`, `$500.00`, `¥2,980`, `9,000`

Output keeps the original separators (`1.299,99`, `1 299`, `۱٬۲۹۹`), digit
script (Persian/Arabic-Indic) and grouping style (`RMB 9999 → RMB 10000`).

### Custom rounding step

Setting a **rounding step** (Options → Rounding, global or per-site) replaces
the charm-only rule above: every matched price is rounded up to the next
multiple of the step, always strictly higher — even one already sitting on a
multiple, since numbers are deliberately anchored just under a round figure:

- `10.90` with step `1` → `11`
- `1,900,000` with step `100,000` → `2,000,000` (already a multiple, still
  bumped — that's the point)
- `12.00` with step `5` → `15`

A per-site value of `0` forces the default charm-only rule on that site even
when a global step is set.

## Supported currencies

Symbols ($ € £ ¥ ￥ ₹ ₽ ₩ ₺ ₪ ₫ … ﷼), ISO codes ("299 EUR", "USD 12.99", "RMB
5999"), prefix words ("Rs. 499", "US$ 5") and suffix words (تومان, ریال, 元, 円,
원, zł, Kč, kr, lei, Ft, руб, грн, TL). Persian/Arabic digits, Arabic separators
(٬ ٫), European formats (1.299,99), space thousands (1 299), the Swiss/French
apostrophe thousands separator (`CHF 1'234.50`, straight `'` or typographic
`’`), and Indian lakh/crore grouping (`₹1,23,456`, 2-digit groups before the
final 3-digit group) are supported. Ranges, was/now offers, subscriptions and
"starting at" phrases need no special patterns: each price in them is matched
individually and the surrounding text is preserved. A leading minus sign (ASCII
`-` or Unicode `−` U+2212) on a refund/negative amount is never part of the
match, so it's always left exactly as-is.

**Known limitation**: content inside a **shadow DOM** (open or closed) is not
scanned — `MutationObserver` and `querySelectorAll` don't cross shadow
boundaries, so prices rendered by web-component-based widgets are invisible to
`PriceFixerContent`. Documented by a test in `content.test.ts` rather than
worked around, since a real fix means observing every discovered shadow root
individually (and closed roots are unreachable from a content script no matter
what).

## Extension messaging

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

- `ci.yml` - Main pipeline (lint, test, build on the Node version in `.nvmrc`,
  packages via `scripts/package.js`)
- `pr-check.yml` - PR validation
- `security.yml` - Dependency audit + CodeQL
- `outdated.yml` - Monthly check for newer package versions; keeps one "Package
  updates available" issue open while updates exist
- `release.yml` - On `v*` tags: validate, build, attach both zips to a GitHub
  release, then publish to the Chrome Web Store / AMO when the store secrets
  (`CHROME_*`, `AMO_JWT_*`) are configured; see the file header.
