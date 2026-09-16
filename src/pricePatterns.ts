/**
 * Price detection and rounding.
 */

import { RegexPatterns, CurrencyDetection, PersianDigits } from './regex-patterns';

export interface PriceMatch {
  value: number;
  currency: string;
  originalText: string;
  startIndex: number;
  endIndex: number;
  pattern?: string;
}

export class PricePatterns {
  private static processedCache = new Map<string, PriceMatch[]>();
  private static extraPatterns: RegExp[] = [];

  /** User-defined patterns (see customRules.ts); each must capture `amount`. */
  public static setExtraPatterns(patterns: RegExp[]): void {
    this.extraPatterns = patterns.filter(p => p.global);
    this.clearCache();
  }

  /**
   * Parse number string with smart format detection
   */
  private static parseNumber(numStr: string): number {
    // Arabic thousands (٬) and decimal (٫) separators are unambiguous
    let cleanStr = PersianDigits.convertToEnglish(numStr)
      .replace(/[٬ \u00a0\u202f]/g, '')
      .replace(/٫/g, '.');

    if (cleanStr.includes('.') && cleanStr.includes(',')) {
      // Both separators present: the last one is the decimal separator
      // 1.299,99 (European) or 1,299.99 (American)
      const lastDot = cleanStr.lastIndexOf('.');
      const lastComma = cleanStr.lastIndexOf(',');
      if (lastComma > lastDot) {
        cleanStr = cleanStr.replace(/\./g, '').replace(',', '.');
      } else {
        cleanStr = cleanStr.replace(/,/g, '');
      }
    } else if (/[.,]/.test(cleanStr)) {
      const sep = cleanStr.includes('.') ? '.' : ',';
      const parts = cleanStr.split(sep);
      const allGroupsOfThree = parts.slice(1).every(p => p.length === 3);
      if (parts.length > 2 || (parts.length === 2 && allGroupsOfThree)) {
        // 1.299 / 1,299 / 12.345.678 → thousand separators
        cleanStr = parts.join('');
      } else {
        // 5.99 / 5,99 / 49,9 → decimal separator
        cleanStr = parts.join('.');
      }
    }

    return parseFloat(cleanStr) || 0;
  }

  /**
   * Whole prices are judged after dropping trailing all-zero thousand groups,
   * so 1,299,000 (Toman, Rupiah, Won...) is looked at as "1299".
   */
  private static significantWhole(price: number): { whole: number; scale: number } {
    let whole = Math.round(price);
    let scale = 1;
    while (whole >= 1000 && whole % 1000 === 0) {
      whole /= 1000;
      scale *= 1000;
    }
    return { whole, scale };
  }

  /**
   * Does this price use charm pricing (a value engineered to read lower than it is)?
   * - any fractional amount: 5.99, 5.95, 5.49, 0.99
   * - whole amounts of two or more digits ending in 9: 19, 199, 1999, 149
   * - the same at thousands scale: 999,000, 1,299,000
   */
  public static isCharmPrice(price: number): boolean {
    if (price <= 0) {
      return false;
    }
    const cents = Math.round((price % 1) * 100);
    if (cents !== 0) {
      return true;
    }
    const { whole } = this.significantWhole(price);
    return whole >= 10 && whole % 10 === 9;
  }

  /**
   * Round a charm price up to the number it is pretending not to be.
   * Non-charm prices are returned unchanged.
   *   5.99 → 6, 149.99 → 150, 19 → 20, 199 → 200, 1,299,000 → 1,300,000,
   *   12.00 → 12, 101 → 101, 9 → 9
   */
  public static roundUpPrice(price: number): number {
    if (!this.isCharmPrice(price)) {
      return price;
    }
    const cents = Math.round((price % 1) * 100);
    if (cents !== 0) {
      return Math.ceil(price - 1e-9);
    }
    const { whole, scale } = this.significantWhole(price);
    return (whole + 1) * scale;
  }

  /** Difference between rounded and listed price, rounded to cents (no float noise). */
  public static priceDifference(value: number, rounded: number): number {
    return Math.round((rounded - value) * 100) / 100;
  }

  /**
   * Detect currency from matched text
   */
  private static detectCurrency(text: string): string {
    const stripped = text.replace(/[\d۰-۹٠-٩.,٬٫\s]/g, '');
    for (const [symbol, currency] of Object.entries(CurrencyDetection.symbols)) {
      if (stripped.includes(symbol)) {
        return currency;
      }
    }
    const codeMatch = text.match(CurrencyDetection.codes);
    if (codeMatch?.groups?.code) {
      return codeMatch.groups.code.toUpperCase();
    }
    return 'UNKNOWN';
  }

  /**
   * Apply a single pattern to text. The pattern must expose an `amount` named group.
   */
  private static applyPattern(text: string, pattern: RegExp, patternName: string): PriceMatch[] {
    const matches: PriceMatch[] = [];
    let match: RegExpExecArray | null;

    pattern.lastIndex = 0;

    while ((match = pattern.exec(text)) !== null) {
      const amount = match.groups?.amount;
      if (amount) {
        const value = this.parseNumber(amount);
        if (value > 0) {
          matches.push({
            value,
            currency: this.detectCurrency(match[0]),
            originalText: match[0],
            startIndex: match.index,
            endIndex: match.index + match[0].length,
            pattern: patternName,
          });
        }
      }

      if (match[0].length === 0) {
        pattern.lastIndex++;
      }
    }

    return matches;
  }

  // A bare thousands-grouped amount: "۹۸۵,۰۰۰", "۱٬۲۹۹٬۰۰۰" (Persian/Arabic
  // digits), or ASCII "985,000" when the page itself is Persian/Arabic.
  private static readonly ICON_AMOUNT_FA = /^\s*([۰-۹٠-٩]{1,3}(?:[,٬][۰-۹٠-٩]{3})+)\s*$/;
  private static readonly ICON_AMOUNT_ANY = /^\s*([\d۰-۹٠-٩]{1,3}(?:[,٬][\d۰-۹٠-٩]{3})+)\s*$/;

  /** Is this text nothing but a grouped amount (currency shown as an icon)? */
  public static isIconAmount(text: string, rtlPage = false): boolean {
    return (rtlPage ? this.ICON_AMOUNT_ANY : this.ICON_AMOUNT_FA).test(text);
  }

  public static iconAmountMatch(text: string): PriceMatch | null {
    const m = text.match(this.ICON_AMOUNT_ANY);
    if (!m) {
      return null;
    }
    const start = text.indexOf(m[1]);
    return {
      value: this.parseNumber(m[1]),
      currency: 'ICON',
      originalText: m[1],
      startIndex: start,
      endIndex: start + m[1].length,
      pattern: 'iconAmount',
    };
  }

  /** Cheap check used to skip text that cannot contain a price. */
  public static mayContainPrice(text: string): boolean {
    return (
      CurrencyDetection.marker.test(text) ||
      this.extraPatterns.some(p => {
        p.lastIndex = 0;
        return p.test(text);
      })
    );
  }

  /**
   * Find all price matches in text
   */
  public static findPrices(text: string): PriceMatch[] {
    const cached = this.processedCache.get(text);
    if (cached) {
      return cached;
    }

    if (!this.mayContainPrice(text)) {
      return [];
    }

    const allMatches: PriceMatch[] = [];
    const patterns: Array<[string, RegExp]> = [
      ['symbolPrefix', RegexPatterns.symbolPrefix],
      ['symbolSuffix', RegexPatterns.symbolSuffix],
      ['currencyCodeSuffix', RegexPatterns.currencyCodeSuffix],
      ['currencyCodePrefix', RegexPatterns.currencyCodePrefix],
    ];

    for (const [name, pattern] of patterns) {
      allMatches.push(...this.applyPattern(text, pattern, name));
    }
    this.extraPatterns.forEach((pattern, i) => {
      allMatches.push(...this.applyPattern(text, pattern, `custom_${i}`));
    });

    const finalMatches = this.removeOverlaps(allMatches);

    this.processedCache.set(text, finalMatches);
    if (this.processedCache.size > 1000) {
      const firstKey = this.processedCache.keys().next().value;
      if (firstKey !== undefined) {
        this.processedCache.delete(firstKey);
      }
    }

    return finalMatches;
  }

  /**
   * Remove overlapping matches, keeping the earliest (and longest) one
   */
  private static removeOverlaps(matches: PriceMatch[]): PriceMatch[] {
    if (matches.length <= 1) {
      return matches;
    }

    matches.sort((a, b) => a.startIndex - b.startIndex || b.endIndex - a.endIndex);

    const result: PriceMatch[] = [];
    let lastEnd = -1;
    for (const match of matches) {
      if (match.startIndex >= lastEnd) {
        result.push(match);
        lastEnd = match.endIndex;
      }
    }
    return result;
  }

  private static readonly NUMERIC_RUN =
    /[\d۰-۹٠-٩](?:[\d۰-۹٠-٩.,٬٫]|[ \u00a0\u202f](?=[\d۰-۹٠-٩]{3}))*/;

  /**
   * Format a number the way the original amount was written: same thousands
   * and decimal separators, same digit script (Persian/Arabic-Indic/ASCII).
   */
  private static formatNumber(value: number, originalText: string): string {
    const run = originalText.match(this.NUMERIC_RUN)?.[0] ?? '';
    const ascii = PersianDigits.convertToEnglish(run);

    // Work out which separator meant what in the original
    let groupSep = '';
    let decimalSep = '.';
    const spaceSep = ascii.match(/[ \u00a0\u202f]/)?.[0];
    if (spaceSep) {
      groupSep = spaceSep;
    } else if (ascii.includes('٬')) {
      groupSep = '٬';
    }
    if (ascii.includes('٫')) {
      decimalSep = '٫';
    }
    const hasDot = ascii.includes('.');
    const hasComma = ascii.includes(',');
    if (hasDot && hasComma) {
      const dotIsDecimal = ascii.lastIndexOf('.') > ascii.lastIndexOf(',');
      decimalSep = dotIsDecimal ? '.' : ',';
      groupSep = dotIsDecimal ? ',' : '.';
    } else if (hasDot || hasComma) {
      const sep = hasDot ? '.' : ',';
      const parts = ascii.split(sep);
      const isGroup = parts.length > 2 || parts[1]?.length === 3;
      if (isGroup) {
        groupSep = sep;
        decimalSep = sep === '.' ? ',' : '.';
      } else {
        decimalSep = sep;
      }
    }
    if (!groupSep) {
      groupSep = decimalSep === ',' ? '.' : /[۰-۹]/.test(run) ? '٬' : ',';
    }

    const [intPart, decPart] = value.toString().split('.');
    let formatted = intPart;
    // Group thousands unless the page wrote a 4+ digit amount without any
    // separator ("RMB 9999", "1899元"): keep that style.
    const originalHadGroups = /[.,٬\u0020\u00a0\u202f][\d۰-۹٠-٩]{3}(?![\d۰-۹٠-٩])/.test(ascii);
    const originalIntDigits = ascii.split(/[.,٫]/)[0].replace(/\D/g, '').length;
    const ungroupedStyle = !originalHadGroups && originalIntDigits > 3;
    if (intPart.length > 3 && !ungroupedStyle) {
      formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, groupSep);
    }
    if (decPart) {
      formatted += decimalSep + decPart;
    }
    return PersianDigits.matchScript(formatted, run);
  }

  /**
   * Format the rounded value back into the original text, keeping currency
   * symbols, codes, words and whitespace exactly as they were.
   */
  public static formatPrice(roundedValue: number, originalMatch: PriceMatch): string {
    const { originalText } = originalMatch;
    const formatted = this.formatNumber(roundedValue, originalText);
    if (this.NUMERIC_RUN.test(originalText)) {
      return originalText.replace(this.NUMERIC_RUN, formatted);
    }
    return formatted;
  }

  /**
   * Clear processing cache
   */
  public static clearCache(): void {
    this.processedCache.clear();
  }
}
