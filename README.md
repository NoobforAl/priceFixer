# Price Fixer

**$5.99 is $6.** A Chrome/Firefox extension that finds charm prices on any web
page and shows the number they are pretending not to be.

<p align="center">
  <img src="screenshots/00-icon.png" width="96" alt="Price Fixer icon">
</p>

| Before                                   | After                                   |
| ---------------------------------------- | --------------------------------------- |
| ![](screenshots/01-test-page-before.png) | ![](screenshots/02-test-page-after.png) |

## How it works

- Every price on the page is scanned — plain text, prices split across several
  elements (Amazon's `$` `5` `.` `99`, Walmart's superscript cents, Digikala's
  Toman icon) and content that loads later.
- Only **charm prices** are changed: `.99`/`.95`/`.49` cents, whole amounts
  ending in 9 (`$199`), and the same at thousands scale (`999,000`). Round
  prices such as `$12.00` or `$500` are never touched.
- **Highlight mode** (default) shows the honest price with a green highlight;
  hover it to see the listed price and how little was actually taken off.
  **Replace mode** swaps the text silently.
- Nothing is destroyed: every change is recorded and **Show originals** puts the
  page back exactly as it was. Restoring a site keeps it untouched for the rest
  of the browser session until you rescan.
- The page's own scripts keep working — the price element's text is just the
  honest number; the listed price lives in an attribute.

![Tooltip](screenshots/03-tooltip.png)

## Screenshots

| Amazon                         | Walmart                         |
| ------------------------------ | ------------------------------- |
| ![](screenshots/05-amazon.png) | ![](screenshots/06-walmart.png) |

| Digikala (Persian digits, Toman icon) | Apple                         |
| ------------------------------------- | ----------------------------- |
| ![](screenshots/07-digikala.png)      | ![](screenshots/08-apple.png) |

| Popup                         | Custom rules                        |
| ----------------------------- | ----------------------------------- |
| ![](screenshots/09-popup.png) | ![](screenshots/10-popup-rules.png) |

![Split prices and non-prices](screenshots/04-split-prices-and-non-prices.png)

## Supported prices

- Symbols before or after the number: `$` `€` `£` `¥` `￥` `₹` `₽` `₩` `₺` `₪`
  `₫` `₴` `₸` `₱` `﷼` and more — `$5.99`, `5,99 €`, `₹499`, `￥99.00`
- ISO codes and words: `299 EUR`, `USD 12.99`, `RMB 5999`, `Rs. 499`, `US$ 5`,
  `99元`, `1.999円`, `49,99 zł`, `1 299 Kč`, `299 kr`, `۱٬۲۹۹٬۰۰۰ تومان`
- Number formats: `1,234.99`, `1.234,99`, `1 299`, Persian/Arabic-Indic digits
  with `٬`/`٫` separators. Output keeps the page's own separators, digit script
  and grouping style.
- Iranian shops that draw the currency as an icon: a bare grouped Persian number
  next to an `<svg>`/`<img>` counts as a price.

Numbers without a currency marker are never touched, so dates, phone numbers,
order IDs, ratings, "ships in 15 days" and "save 25%" stay as they are.

## Rounding

| Listed                           | Shown             | Why                               |
| -------------------------------- | ----------------- | --------------------------------- |
| `$5.99`                          | `$6`              | fractional → next whole unit      |
| `$149.99`                        | `$150`            |                                   |
| `€1.299,99`                      | `€1.300`          | European separators preserved     |
| `$199`                           | `$200`            | whole amount ending in 9          |
| `۱٬۲۹۹٬۰۰۰ تومان`                | `۱٬۳۰۰٬۰۰۰ تومان` | same after dropping `٬۰۰۰` groups |
| `$9`, `$12.00`, `$101`, `¥2,980` | unchanged         | not charm pricing                 |

## Install

- **Firefox**:
  [Price Fixer on Firefox Add-ons](https://addons.mozilla.org/firefox/addon/price-fixer/)
- **Chrome / from source**: download the zip from the
  [latest release](https://github.com/NoobforAl/priceFixer/releases/latest), or
  build it yourself. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Using it

- Click the toolbar icon: global on/off, per-site on/off, Highlight/Replace,
  **Rescan page**, **Show originals**, and the list of what changed on the page.
- `Ctrl+Shift+P` (`⌘⇧P` on macOS) toggles the extension.
- **Settings** (gear icon in the popup, or the browser's extension options)
  opens a full-page settings tab: the same switches, blocked sites, every
  per-site switch you have set, rules for any site, statistics, and a reset.
- Light and dark themes: follows your system by default; the sun/moon button in
  the popup or the Theme control in settings overrides it.
- **Security** (in the popup):
  - _Pause on payment & finance pages_ (on by default) — checkout and invoice
    pages, card forms, payment gateways (PayPal, Stripe, Klarna, Shaparak, …),
    banks, brokers, crypto exchanges, accounting and tax sites are never
    changed, so an amount you pay or trade at is always shown exactly as the
    site states it.
  - _Blocked sites_ — **Block this site** keeps Price Fixer off the current site
    (and its subdomains) permanently; you can also type any domain to add it,
    and remove entries from the list.
- **Rules** (bottom of the popup) lets you add exceptions, one per line:
  - _Ignore elements on this site_ / _everywhere_ — CSS selectors, e.g.
    `.unit-price`, `#cart-total`
  - _Ignore text matching_ — regexes, e.g. `per\s+month`
  - _Extra price patterns_ — regexes with an `(?<amount>…)` group for formats
    the built-ins don't know, e.g. `(?<amount>\d[\d,]*)\s*coins`

  Rules are stored in sync storage and applied to open tabs immediately; invalid
  entries are listed under the form.

## Contributing

- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md): build, test, load the extension,
  add a shop or protected site
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the engine works
- [docs/RELEASING.md](docs/RELEASING.md): versioning and store publishing

## Roadmap

- Page summary card ("47 prices, 39 use charm pricing")
- "Real total" for carts and comparison pages
- Hidden-fee / drip-pricing hints (`+ tax`, `+ shipping`, `from $X*`)
- Unit prices (`$3.99/lb` → `$4/lb`)
- Currency conversion hints

## License

[MIT](LICENSE)
