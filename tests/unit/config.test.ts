/**
 * Data checks for src/config/*.json, so a typo in a hand-edited list fails CI
 * instead of silently never matching.
 */

import shopsSchema from '../../src/config/schema/shops.schema.json';
import protectedFile from '../../src/config/protected-sites.json';
import { hostMatchesPattern } from '../../src/sites/domains';
import { findShop, getPriceElements, SHOPS } from '../../src/sites/shops';
import { detectPaymentPage, isBlockedSite, protectedHostReason } from '../../src/sites/siteGuard';

const DOMAIN = /^([a-z0-9-]+\.)+[a-z0-9-]+$/;
const DOMAIN_OR_WILDCARD = /^(([a-z0-9-]+\.)+[a-z0-9-]+|[a-z0-9-]+\.\*)$/;

function duplicates(values: string[]): string[] {
  return values.filter((value, i) => values.indexOf(value) !== i);
}

function invalidSelectors(selectors: string[]): string[] {
  return selectors.filter(selector => {
    try {
      document.querySelector(selector);

      return false;
    } catch {
      return true;
    }
  });
}

describe('shops.json', () => {
  const categories: string[] = shopsSchema.definitions.shop.properties.category.enum;

  it('has valid, lowercase domain patterns', () => {
    const bad = SHOPS.flatMap(shop => shop.domains).filter(d => !DOMAIN_OR_WILDCARD.test(d));

    expect(bad).toEqual([]);
  });

  it('lists every domain pattern and shop name once', () => {
    expect(duplicates(SHOPS.flatMap(shop => shop.domains))).toEqual([]);
    expect(duplicates(SHOPS.map(shop => shop.name))).toEqual([]);
  });

  it('uses only the categories from the schema', () => {
    const bad = SHOPS.filter(shop => !categories.includes(shop.category)).map(s => s.name);

    expect(bad).toEqual([]);
  });

  it('has selectors that parse', () => {
    const all = SHOPS.flatMap(s => [...s.priceSelectors, ...s.skipSelectors, ...s.pageIndicators]);

    expect(invalidSelectors(all)).toEqual([]);
  });
});

describe('protected-sites.json', () => {
  const groups = protectedFile.hostGroups;
  const hosts = groups.flatMap(group => group.hosts);
  const segments = protectedFile.pathSegmentGroups.flatMap(group => group.segments);

  it('has valid, lowercase hosts, each listed once across all groups', () => {
    expect(hosts.filter(h => !DOMAIN.test(h))).toEqual([]);
    expect(duplicates(hosts)).toEqual([]);
  });

  it('has unique group ids and a reason for every group', () => {
    expect(duplicates(groups.map(group => group.id))).toEqual([]);
    expect(groups.filter(group => !group.reason.trim()).map(g => g.id)).toEqual([]);
  });

  it('has unique lowercase path segments without "cart"', () => {
    expect(segments.filter(s => !/^[a-z0-9-]+$/.test(s))).toEqual([]);
    expect(duplicates(segments)).toEqual([]);
    expect(segments).not.toContain('cart');
  });

  it('has card-field selectors that parse', () => {
    expect(invalidSelectors(protectedFile.cardFieldSelectors)).toEqual([]);
  });

  it('never protects a known shop by host (shops would stop working)', () => {
    const shopDomains = SHOPS.flatMap(shop => shop.domains).filter(d => !d.endsWith('.*'));

    expect(shopDomains.filter(d => protectedHostReason(d) !== null)).toEqual([]);
  });

  it('is not bypassed by a trailing-dot (fully-qualified) hostname', () => {
    const reason = (url: string) => detectPaymentPage(new URL(url), document).reason;

    expect(reason('https://www.paypal.com./')).toBe('payment gateway');
    expect(reason('https://secure.chase.com./accounts')).toBe('bank site');
    expect(reason('https://pay.shop.example.com./')).toBe('checkout page');
    expect(isBlockedSite('shop.com.', ['shop.com'])).toBe(true);
    expect(findShop('www.amazon.de.')?.name).toBe('Amazon');
  });

  it('reports the reason of the matching group', () => {
    const reason = (url: string) => detectPaymentPage(new URL(url), document).reason;

    expect(reason('https://www.paypal.com/')).toBe('payment gateway');
    expect(reason('https://bank.shaparak.ir/')).toBe('payment gateway');
    expect(reason('https://secure.chase.com/accounts')).toBe('bank site');
    expect(reason('https://www.bankmellat.ir/')).toBe('bank site');
    expect(reason('https://www.tradingview.com/chart/')).toBe('trading site');
    expect(reason('https://www.binance.com/en/trade')).toBe('crypto exchange');
    expect(reason('https://nobitex.ir/')).toBe('crypto exchange');
    expect(reason('https://go.xero.com/')).toBe('accounting site');
    expect(reason('https://www.irs.gov/payments')).toBe('tax site');
    expect(reason('https://shop.example.com/checkout')).toBe('checkout page');
    expect(reason('https://shop.example.com/account/invoices/123')).toBe('invoice page');
    expect(reason('https://shop.example.com/products/invoice-printer')).toBeNull();
  });
});

describe('hostMatchesPattern', () => {
  it('matches a plain domain and its subdomains', () => {
    expect(hostMatchesPattern('target.com', 'target.com')).toBe(true);
    expect(hostMatchesPattern('www.target.com', 'target.com')).toBe(true);
    expect(hostMatchesPattern('mytarget.com', 'target.com')).toBe(false);
  });

  it('matches name.* under any one- or two-label suffix', () => {
    expect(hostMatchesPattern('amazon.de', 'amazon.*')).toBe(true);
    expect(hostMatchesPattern('www.amazon.co.uk', 'amazon.*')).toBe(true);
    expect(hostMatchesPattern('smile.amazon.com', 'amazon.*')).toBe(true);
    expect(hostMatchesPattern('notamazon.com', 'amazon.*')).toBe(false);
    expect(hostMatchesPattern('amazon.attacker.example.com', 'amazon.*')).toBe(false);
    expect(hostMatchesPattern('amazon', 'amazon.*')).toBe(false);
  });
});

describe('findShop', () => {
  afterEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('finds shops by domain, including country suffixes', () => {
    expect(findShop('www.amazon.com.mx')?.name).toBe('Amazon');
    expect(findShop('www.ebay.co.uk')?.name).toBe('eBay');
    expect(findShop('www.homedepot.com')?.name).toBe('The Home Depot');
  });

  it('finds regional shops', () => {
    expect(findShop('www.digikala.com')?.name).toBe('Digikala');
    expect(findShop('torob.com')?.category).toBe('price-comparison');
    expect(findShop('shopee.co.id')?.name).toBe('Shopee');
    expect(findShop('www.zalando.co.uk')?.name).toBe('Zalando');
    expect(findShop('allegro.pl')?.name).toBe('Allegro');
    expect(findShop('www.mercadolivre.com.br')?.name).toBe('Mercado Libre');
    expect(findShop('store.steampowered.com')?.category).toBe('digital');
  });

  it('no longer matches brand names inside unrelated domains', () => {
    expect(findShop('pineapple.com')).toBeNull();
    expect(findShop('targetpractice.org')).toBeNull();
  });

  it('recognises a Shopify store on its own domain by page indicators', () => {
    expect(findShop('my-own-store.com')).toBeNull();

    document.head.innerHTML = '<link rel="preconnect" href="https://cdn.shopify.com">';

    expect(findShop('my-own-store.com')?.name).toBe('Shopify Store');
  });

  it('returns price elements outside skipped containers', () => {
    const amazon = findShop('amazon.com');

    document.body.innerHTML = `
      <span class="a-price" id="price">$5.99</span>
      <div class="a-star-rating"><span class="a-price" id="rating">4.5</span></div>`;

    expect(amazon).not.toBeNull();
    expect(getPriceElements(amazon!).map(el => el.id)).toEqual(['price']);
  });
});
