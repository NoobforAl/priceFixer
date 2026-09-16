const SHOPPING_DOMAINS: string[] = [
  // Marketplaces
  'amazon.com',
  'amazon.co.uk',
  'amazon.de',
  'amazon.fr',
  'amazon.es',
  'amazon.it',
  'amazon.co.jp',
  'amazon.ca',
  'amazon.com.au',
  'amazon.in',
  'amazon.com.br',
  'amazon.nl',
  'amazon.sg',
  'amazon.sa',
  'amazon.ae',
  'amazon.com.mx',
  'ebay.com',
  'ebay.co.uk',
  'ebay.de',
  'ebay.fr',
  'ebay.com.au',
  'ebay.ca',
  'ebay.it',
  'ebay.es',
  'etsy.com',
  'aliexpress.com',
  'alibaba.com',
  'wish.com',
  'temu.com',
  'mercadolibre.com',
  'rakuten.co.jp',
  'flipkart.com',

  // Big-box & department stores
  'walmart.com',
  'target.com',
  'costco.com',
  'bestbuy.com',
  'bestbuy.ca',
  'homedepot.com',
  'lowes.com',
  'macys.com',
  'nordstrom.com',
  'kohls.com',
  'jcpenney.com',
  'sears.com',
  'wayfair.com',
  'overstock.com',
  'newegg.com',
  'bhphotovideo.com',
  'microcenter.com',
  'samsclub.com',

  // Fashion & apparel
  'nike.com',
  'adidas.com',
  'asos.com',
  'zara.com',
  'hm.com',
  'uniqlo.com',
  'gap.com',
  'shein.com',
  'forever21.com',
  'urbanoutfitters.com',
  'lululemon.com',
  'puma.com',
  'reebok.com',
  'newbalance.com',
  'footlocker.com',

  // Electronics & tech
  'apple.com',
  'samsung.com',
  'dell.com',
  'hp.com',
  'lenovo.com',
  'lg.com',
  'sony.com',
  'microsoft.com',
  'bose.com',

  // Home & furniture
  'ikea.com',
  'crateandbarrel.com',
  'potterybarn.com',
  'westelm.com',
  'bedbathandbeyond.com',

  // Grocery & pharmacy
  'instacart.com',
  'freshdirect.com',
  'walgreens.com',
  'cvs.com',

  // Travel & booking
  'booking.com',
  'expedia.com',
  'airbnb.com',
  'hotels.com',
  'trivago.com',
  'kayak.com',
  'agoda.com',
  'priceline.com',

  // Specialty
  'chewy.com',
  'zappos.com',
  'gamestop.com',
  'barnesandnoble.com',
  'staples.com',
  'officedepot.com',
  'sephora.com',
  'ulta.com',
];

const SHOPIFY_INDICATORS = [
  'meta[name="shopify-checkout-api-token"]',
  'meta[name="shopify-digital-wallet"]',
  'link[href*="cdn.shopify.com"]',
  'script[src*="cdn.shopify.com"]',
];

export function isKnownShoppingSite(hostname: string): boolean {
  const domain = hostname.replace(/^www\./, '');
  return SHOPPING_DOMAINS.some(shop => domain === shop || domain.endsWith(`.${shop}`));
}

export function isShopifyStore(): boolean {
  for (const selector of SHOPIFY_INDICATORS) {
    if (document.querySelector(selector)) {
      return true;
    }
  }
  return false;
}

export function getShoppingSiteName(hostname: string): string | null {
  const domain = hostname.replace(/^www\./, '');
  const brandMap: Record<string, string> = {
    amazon: 'Amazon',
    ebay: 'eBay',
    etsy: 'Etsy',
    walmart: 'Walmart',
    target: 'Target',
    bestbuy: 'Best Buy',
    aliexpress: 'AliExpress',
    temu: 'Temu',
    shein: 'SHEIN',
    apple: 'Apple',
    nike: 'Nike',
    ikea: 'IKEA',
    booking: 'Booking.com',
    airbnb: 'Airbnb',
    costco: 'Costco',
    newegg: 'Newegg',
    shopify: 'Shopify Store',
  };

  for (const [key, name] of Object.entries(brandMap)) {
    if (domain.includes(key)) {
      return name;
    }
  }

  if (isKnownShoppingSite(hostname)) {
    const parts = domain.split('.');
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  }

  return null;
}
