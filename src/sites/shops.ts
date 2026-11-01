/**
 * Known shopping sites, loaded from `src/config/shops.json`.
 *
 * To add a shop, add an entry to that file (the schema next to it describes
 * every field, and editors validate against it). `tests/unit/config.test.ts`
 * checks the data: valid domains, no duplicates, selectors that parse.
 */

import shopsFile from '../config/shops.json';
import { hostMatchesPattern } from './domains';

export type ShopCategory =
  | 'marketplace'
  | 'department-store'
  | 'fashion'
  | 'electronics'
  | 'home'
  | 'grocery'
  | 'travel'
  | 'specialty'
  | 'digital'
  | 'price-comparison'
  | 'platform';

/** One entry of shops.json. Optional lists default to empty. */
export interface ShopEntry {
  name: string;
  category: string;
  domains: string[];
  priceSelectors?: string[];
  skipSelectors?: string[];
  pageIndicators?: string[];
}

export interface ShopsConfig {
  shops: ShopEntry[];
}

export interface Shop {
  name: string;
  category: ShopCategory;
  domains: string[];
  priceSelectors: string[];
  skipSelectors: string[];
  pageIndicators: string[];
}

// Typed assignment: tsc fails the build if shops.json stops matching ShopsConfig.
const config: ShopsConfig = shopsFile;

export const SHOPS: readonly Shop[] = config.shops.map(entry => ({
  name: entry.name,
  category: entry.category as ShopCategory,
  domains: entry.domains,
  priceSelectors: entry.priceSelectors ?? [],
  skipSelectors: entry.skipSelectors ?? [],
  pageIndicators: entry.pageIndicators ?? [],
}));

function safeQuery(root: ParentNode, selector: string): Element | null {
  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

/**
 * The shop for this page: matched by hostname first, then by page indicators
 * (a Shopify store on its own domain).
 */
export function findShop(hostname: string, root: ParentNode = document): Shop | null {
  const byDomain = SHOPS.find(shop =>
    shop.domains.some(pattern => hostMatchesPattern(hostname, pattern))
  );

  if (byDomain) {
    return byDomain;
  }

  return (
    SHOPS.find(shop => shop.pageIndicators.some(selector => safeQuery(root, selector))) ?? null
  );
}

function isInsideSkipped(el: Element, skipSet: Set<Element>): boolean {
  let parent = el.parentElement;

  while (parent) {
    if (skipSet.has(parent)) {
      return true;
    }

    parent = parent.parentElement;
  }

  return false;
}

/** Elements matching the shop's price selectors, minus those inside a skipped element. */
export function getPriceElements(shop: Shop, root: ParentNode = document): Element[] {
  const elements: Element[] = [];
  const skipSet = new Set<Element>();

  for (const selector of shop.skipSelectors) {
    try {
      root.querySelectorAll(selector).forEach(el => skipSet.add(el));
    } catch {
      // Invalid selector: ignored (config.test.ts catches these)
    }
  }

  for (const selector of shop.priceSelectors) {
    try {
      root.querySelectorAll(selector).forEach(el => {
        if (!skipSet.has(el) && !isInsideSkipped(el, skipSet)) {
          elements.push(el);
        }
      });
    } catch {
      // Invalid selector: ignored (config.test.ts catches these)
    }
  }

  return elements;
}
