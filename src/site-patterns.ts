/**
 * Site-specific price patterns for popular shopping sites.
 *
 * HOW TO ADD A NEW SITE:
 * 1. Add an entry to SITE_PATTERNS below
 * 2. Set `domainMatch` to a string the hostname must contain (e.g. 'amazon')
 * 3. Add `priceSelectors` — CSS selectors that target price elements on that site
 * 4. Add `skipSelectors` — elements that look like prices but aren't (navigation, etc.)
 *
 * Each pattern is self-contained. The content script uses these to:
 * - Focus scanning on known price containers (faster, fewer false positives)
 * - Skip non-price elements (ratings, dates, product IDs)
 */

export interface SitePattern {
  name: string;
  domainMatch: string | string[];
  priceSelectors: string[];
  skipSelectors: string[];
}

export const SITE_PATTERNS: SitePattern[] = [
  // ─── Amazon ────────────────────────────────────────────
  {
    name: 'Amazon',
    domainMatch: 'amazon',
    priceSelectors: [
      '.a-price',
      '.a-price-whole',
      '.a-price-fraction',
      '.a-offscreen',
      '#priceblock_ourprice',
      '#priceblock_dealprice',
      '#priceblock_saleprice',
      '.apexPriceToPay',
      '.priceToPay',
      '.a-color-price',
      '.a-text-price',
      '[data-a-color="price"]',
      '.sx-price-whole',
      '.sx-price-fractional',
      '.price-info-superscript',
      '.a-price-range',
    ],
    skipSelectors: [
      '.a-star-rating',
      '.a-icon-star',
      '.a-section.a-spacing-none.a-text-center',
      '[data-component-type="s-product-image"]',
    ],
  },

  // ─── eBay ──────────────────────────────────────────────
  {
    name: 'eBay',
    domainMatch: 'ebay',
    priceSelectors: [
      '.s-item__price',
      '.x-price-primary',
      '.x-price-approx',
      '.x-bin-price__content',
      '#prcIsum',
      '.vi-price',
      '.display-price',
      '[itemprop="price"]',
      '.item-price',
      '.s-item__detail--primary',
    ],
    skipSelectors: [
      '.s-item__hotness',
      '.s-item__watchCount',
      '.s-item__reviews',
      '.s-item__seller-info',
    ],
  },

  // ─── Walmart ───────────────────────────────────────────
  {
    name: 'Walmart',
    domainMatch: 'walmart',
    priceSelectors: [
      '[data-automation-id="product-price"]',
      '.price-main',
      '.price-group',
      '.price-characteristic',
      '.price-mantissa',
      '[itemprop="price"]',
      '.inline-flex.flex-wrap',
      '.f2',
      '.lh-copy',
    ],
    skipSelectors: ['[data-automation-id="product-ratings"]', '.stars-container'],
  },

  // ─── Target ────────────────────────────────────────────
  {
    name: 'Target',
    domainMatch: 'target.com',
    priceSelectors: [
      '[data-test="product-price"]',
      '.h-text-bs',
      '.styles__CurrentPriceFontSize',
      '.styles__StyledPromoPrice',
      '[data-test="current-price"]',
      '[data-test="comparison-price"]',
    ],
    skipSelectors: ['[data-test="ratings"]', '[data-test="reviewCount"]'],
  },

  // ─── Best Buy ──────────────────────────────────────────
  {
    name: 'Best Buy',
    domainMatch: 'bestbuy',
    priceSelectors: [
      '.priceView-hero-price',
      '.priceView-customer-price',
      '.priceView-purchase-price',
      '[data-testid="customer-price"]',
      '.pricing-price__regular-price',
      '.pricing-price__sale-price',
    ],
    skipSelectors: ['.rating-reviews-count'],
  },

  // ─── Shopify (generic — covers thousands of stores) ───
  {
    name: 'Shopify',
    domainMatch: ['myshopify.com', 'shopify.com'],
    priceSelectors: [
      '.product-price',
      '.price',
      '.price__regular',
      '.price__sale',
      '.price-item',
      '.price-item--regular',
      '.price-item--sale',
      '[data-product-price]',
      '.product__price',
      '.product-single__price',
      '.money',
      '.current_price',
      '.compare_price',
    ],
    skipSelectors: ['.product-rating', '.shopify-review'],
  },

  // ─── Etsy ──────────────────────────────────────────────
  {
    name: 'Etsy',
    domainMatch: 'etsy',
    priceSelectors: [
      '.currency-value',
      '.wt-text-title-01',
      '.search-listing-card__price',
      '[data-buy-box-listing-id] .wt-text-title-01',
      '.p-lg',
    ],
    skipSelectors: ['.wt-badge', '.wt-text-caption'],
  },

  // ─── AliExpress ────────────────────────────────────────
  {
    name: 'AliExpress',
    domainMatch: 'aliexpress',
    priceSelectors: [
      '.product-price-value',
      '.uniform-banner-box-price',
      '[class*="price"]',
      '.snow-price_SnowPrice__mainS',
    ],
    skipSelectors: ['.rating-star', '.product-reviewer'],
  },

  // ─── Temu ──────────────────────────────────────────────
  {
    name: 'Temu',
    domainMatch: 'temu',
    priceSelectors: ['[class*="Price"]', '[class*="price"]', '.goods-price'],
    skipSelectors: [],
  },

  // ─── SHEIN ─────────────────────────────────────────────
  {
    name: 'SHEIN',
    domainMatch: 'shein',
    priceSelectors: [
      '.product-intro__head-price',
      '.product-price',
      '.from',
      '[class*="productPrice"]',
    ],
    skipSelectors: [],
  },

  // ─── Costco ────────────────────────────────────────────
  {
    name: 'Costco',
    domainMatch: 'costco',
    priceSelectors: ['.price', '.your-price', '#pull-right-price'],
    skipSelectors: [],
  },

  // ─── Newegg ────────────────────────────────────────────
  {
    name: 'Newegg',
    domainMatch: 'newegg',
    priceSelectors: [
      '.price-current',
      '.price-was',
      '.price-save',
      '.goods-price-current',
      '.item-buybox-price-current',
    ],
    skipSelectors: ['.rating'],
  },

  // ─── Wayfair ───────────────────────────────────────────
  {
    name: 'Wayfair',
    domainMatch: 'wayfair',
    priceSelectors: ['[data-enzyme-id="PriceBlock"]', '.SFPrice', '.BasePriceBlock'],
    skipSelectors: [],
  },

  // ─── Nike ──────────────────────────────────────────────
  {
    name: 'Nike',
    domainMatch: 'nike',
    priceSelectors: [
      '[data-test="product-price"]',
      '.product-price',
      '.css-1emn094',
      '[aria-label*="price"]',
    ],
    skipSelectors: [],
  },

  // ─── Booking.com ───────────────────────────────────────
  {
    name: 'Booking.com',
    domainMatch: 'booking.com',
    priceSelectors: [
      '[data-testid="price-and-discounted-price"]',
      '.prco-valign-middle-helper',
      '.bui-price-display__value',
      '.price',
    ],
    skipSelectors: ['.bui-review-score'],
  },

  // ─── Airbnb ────────────────────────────────────────────
  {
    name: 'Airbnb',
    domainMatch: 'airbnb',
    priceSelectors: ['._tyxjp1', '[style*="--pricing"]', '._1jo4hgw'],
    skipSelectors: ['._1qfhp3q'],
  },
];

export function getSitePattern(hostname: string): SitePattern | null {
  const domain = hostname.replace(/^www\./, '').toLowerCase();
  return (
    SITE_PATTERNS.find(pattern => {
      const matches = Array.isArray(pattern.domainMatch)
        ? pattern.domainMatch
        : [pattern.domainMatch];
      return matches.some(m => domain.includes(m));
    }) || null
  );
}

export function getPriceElements(sitePattern: SitePattern): Element[] {
  const elements: Element[] = [];
  const skipSet = new Set<Element>();

  for (const selector of sitePattern.skipSelectors) {
    try {
      document.querySelectorAll(selector).forEach(el => skipSet.add(el));
    } catch {
      // Invalid selector — skip
    }
  }

  for (const selector of sitePattern.priceSelectors) {
    try {
      document.querySelectorAll(selector).forEach(el => {
        if (!skipSet.has(el) && !isInsideSkipped(el, skipSet)) {
          elements.push(el);
        }
      });
    } catch {
      // Invalid selector — skip
    }
  }

  return elements;
}

function isInsideSkipped(el: Element, skipSet: Set<Element>): boolean {
  let parent = el.parentElement;
  while (parent) {
    if (skipSet.has(parent)) return true;
    parent = parent.parentElement;
  }
  return false;
}
