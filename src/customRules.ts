/**
 * User-defined rules, stored in storage.sync under `customRules`.
 * Edited from the popup ("Rules" section), one entry per line.
 */

export interface CustomRules {
  /** domain ("*" = every site) → CSS selectors whose contents are never touched */
  excludeSelectors: Record<string, string[]>;
  /** regex sources; a text node matching any of them is skipped */
  excludePatterns: string[];
  /** regex sources with an `(?<amount>…)` group; extra price formats */
  extraPatterns: string[];
}

export interface CompiledRules {
  excludeSelector: string | null;
  excludePatterns: RegExp[];
  extraPatterns: RegExp[];
  /** entries that failed to compile, for the popup to show */
  errors: string[];
}

export const EMPTY_RULES: CustomRules = {
  excludeSelectors: {},
  excludePatterns: [],
  extraPatterns: [],
};

export function normalizeRules(raw: unknown): CustomRules {
  const r = (raw || {}) as Partial<CustomRules>;
  const lines = (v: unknown): string[] =>
    Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : [];
  const selectors: Record<string, string[]> = {};
  if (r.excludeSelectors && typeof r.excludeSelectors === 'object') {
    for (const [domain, list] of Object.entries(r.excludeSelectors)) {
      const clean = lines(list);
      if (clean.length) {
        selectors[domain] = clean;
      }
    }
  }
  return {
    excludeSelectors: selectors,
    excludePatterns: lines(r.excludePatterns),
    extraPatterns: lines(r.extraPatterns),
  };
}

function compile(source: string, flags: string, errors: string[]): RegExp | null {
  try {
    return new RegExp(source, flags);
  } catch (e) {
    errors.push(`${source}: ${(e as Error).message}`);
    return null;
  }
}

function validSelector(selector: string, errors: string[]): boolean {
  try {
    document.querySelector(selector);
    return true;
  } catch {
    errors.push(`${selector}: invalid selector`);
    return false;
  }
}

export function compileRules(rules: CustomRules, domain: string): CompiledRules {
  const errors: string[] = [];
  const selectors = [
    ...(rules.excludeSelectors['*'] || []),
    ...(rules.excludeSelectors[domain] || []),
  ].filter(s => validSelector(s, errors));

  const extraPatterns: RegExp[] = [];
  for (const source of rules.extraPatterns) {
    if (!source.includes('(?<amount>')) {
      errors.push(`${source}: needs an (?<amount>…) group`);
      continue;
    }
    const re = compile(source, 'giu', errors);
    if (re) {
      extraPatterns.push(re);
    }
  }

  return {
    excludeSelector: selectors.length ? selectors.join(', ') : null,
    excludePatterns: rules.excludePatterns
      .map(p => compile(p, 'iu', errors))
      .filter((r): r is RegExp => r !== null),
    extraPatterns,
    errors,
  };
}
