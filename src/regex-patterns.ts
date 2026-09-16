import { regex } from 'regex';

/**
 * Price detection patterns built with the `regex` library.
 *
 * IMPORTANT: `regex` compiles in "named capture only" mode — a plain `( ... )`
 * group is silently turned into `(?: ... )`. Every amount MUST be captured with
 * a named group (`(?<amount> ... )`) or the match is discarded downstream.
 *
 * Every pattern is anchored on an explicit currency marker (symbol, ISO code
 * or currency word). Unanchored number patterns were removed on purpose: they
 * matched dates, phone numbers, "ships in 15 days", "save 25%", etc.
 */

// Digits: ASCII, Persian (۰-۹) and Arabic-Indic (٠-٩)
const digit = regex`[\d۰-۹٠-٩]`;
// Separators: "." "," plus Arabic thousands (٬ U+066C) and decimal (٫ U+066B)
const groupSep = regex`[.,٬\x20\u00a0\u202f]`;
const decimalSep = regex`[.,٫]`;

// Shared amount grammar (interpolated as a pattern, not a string):
//   1,234.99 / 1.234,99 / 1234 / 12,345 / 5.99 / 0.99 / ۱٬۲۹۹٬۰۰۰
// `(?!digit)` prevents matching only the first 3 digits of "$1000".
const amount = regex`
  (?: ${digit}{1,3} (?: ${groupSep} ${digit}{3} )+ | ${digit}+ )
  (?: ${decimalSep} ${digit}{1,2} )?
  (?! ${digit} )
`;

// Symbols that appear before the number ($5.99, € 5,99, £5, ￥99, ₺49)
const prefixSymbol = regex`[$€£¥￥₹₽₩₺₦₡₪₫₴₸₲₱₵₼₾₿﷼]`;
// Symbols that appear after the number (5,99 €, 5.99€, 100₽, 49₺)
const suffixSymbol = regex`[€£₽₴₸₫₺﷼]`;

// Currency words/abbreviations written before the number
const prefixWord = regex`Rs\.? | RM | R\$ | US\$ | CA\$ | AU\$ | NT\$ | HK\$ | S\$`;
// Currency words written after the number
const suffixWord = regex`
  تومان | تومن | ریال | ﷼ |
  元 | 円 | 원 |
  zł | Kč | kr\.? | lei | Ft | руб\.? | грн | TL | Lt | din\.?
`;

const ISO_CODES = regex`
  USD | EUR | GBP | JPY | CNY | RMB | INR | RUB | CAD | AUD | NZD |
  CHF | SEK | NOK | DKK | PLN | CZK | HUF | BGN | RON | TRY | ZAR |
  BRL | MXN | ARS | CLP | COP | PEN | UYU | IRR | IRT | AED | SAR |
  KRW | HKD | SGD | TWD | THB | IDR | MYR | PHP | VND | ILS | EGP | UAH
`;

// Not followed by a letter — the `v`-flag-safe equivalent of `\b` for
// non-ASCII words like تومان.
const notLetter = regex`(?! \p{L} )`;
const notDigitOrSep = regex`(?<! [\d۰-۹٠-٩.,٬٫] )`;

export const RegexPatterns = {
  // "$5.99", "US$ 1,299.00", "€ 12,50", "₹499", "￥99.00", "Rs. 499"
  symbolPrefix: regex('g')`
    (?: ${prefixSymbol} | (?<! \p{L} ) (?: ${prefixWord} ) ) \s*
    (?<amount> ${amount} )
  `,

  // "5,99 €", "1.299€", "100 ₽", "۱٬۲۹۹٬۰۰۰ تومان", "99元", "49 zł"
  symbolSuffix: regex('g')`
    ${notDigitOrSep}
    (?<amount> ${amount} ) \s*
    (?: ${suffixSymbol} | (?: ${suffixWord} ) ${notLetter} )
  `,

  // "299 EUR", "12.99 USD"
  currencyCodeSuffix: regex('gi')`
    ${notDigitOrSep}
    (?<amount> ${amount} ) \s*
    \b (?<code> ${ISO_CODES} ) \b
  `,
  // "USD 299", "EUR 12,99"
  currencyCodePrefix: regex('gi')`
    \b (?<code> ${ISO_CODES} ) \s*
    (?<amount> ${amount} )
  `,
};

// Currency detection helpers
export const CurrencyDetection = {
  symbols: {
    $: 'DOLLAR',
    '€': 'EUR',
    '£': 'GBP',
    '¥': 'YEN',
    '￥': 'YEN',
    '₹': 'INR',
    '₽': 'RUB',
    '₩': 'KRW',
    '₺': 'TRY',
    '₦': 'NGN',
    '₡': 'CRC',
    '₪': 'ILS',
    '₫': 'VND',
    '₴': 'UAH',
    '₸': 'KZT',
    '₲': 'PYG',
    '₱': 'PHP',
    '₵': 'GHS',
    '₼': 'AZN',
    '₾': 'GEL',
    '₿': 'BTC',
    '﷼': 'IRR',
    تومان: 'IRT',
    تومن: 'IRT',
    ریال: 'IRR',
    元: 'CNY',
    円: 'JPY',
    원: 'KRW',
    zł: 'PLN',
    Kč: 'CZK',
    kr: 'KR',
    lei: 'RON',
    Ft: 'HUF',
    руб: 'RUB',
    грн: 'UAH',
    TL: 'TRY',
    Rs: 'INR',
    RM: 'MYR',
  } as Record<string, string>,

  codes: regex('i')`\b (?<code> ${ISO_CODES} ) \b`,

  /** Quick pre-check: does this text contain anything that could be a price? */
  marker: regex('i')`
    ${prefixSymbol} | ${suffixSymbol}
    | \b (?: ${ISO_CODES} | ${prefixWord} ) (?! \p{L} )
    | (?: ${suffixWord} ) ${notLetter}
  `,
};

// Persian/Arabic digits support
export const PersianDigits = {
  persian: '۰۱۲۳۴۵۶۷۸۹',
  arabic: '٠١٢٣٤٥٦٧٨٩',
  english: '0123456789',

  converter: regex('g')`[۰-۹٠-٩]`,

  convertToEnglish(str: string): string {
    return str.replace(this.converter, digit => {
      const p = this.persian.indexOf(digit);
      if (p >= 0) {
        return this.english[p];
      }
      return this.english[this.arabic.indexOf(digit)];
    });
  },

  /** Convert ASCII digits to the script used in `like` (Persian, Arabic-Indic or ASCII). */
  matchScript(str: string, like: string): string {
    const table = /[۰-۹]/.test(like) ? this.persian : /[٠-٩]/.test(like) ? this.arabic : null;
    if (!table) {
      return str;
    }
    return str.replace(/\d/g, d => table[Number(d)]);
  },
};
