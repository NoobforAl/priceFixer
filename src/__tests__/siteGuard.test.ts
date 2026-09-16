import {
  detectPaymentPage,
  domainMatches,
  isBlockedSite,
  isPaymentHost,
  isPaymentUrl,
  normalizeBlockedSites,
  normalizeDomain,
} from '../siteGuard';

describe('normalizeDomain', () => {
  it('strips scheme, www, path and case', () => {
    expect(normalizeDomain('https://www.Shop.com/cart?x=1')).toBe('shop.com');
    expect(normalizeDomain('  WWW.Example.org. ')).toBe('example.org');
    expect(normalizeDomain('shop.com:8080/path')).toBe('shop.com');
  });

  it('rejects garbage', () => {
    expect(normalizeDomain('')).toBe('');
    expect(normalizeDomain('not a domain')).toBe('');
    expect(normalizeDomain('http://')).toBe('');
  });
});

describe('normalizeBlockedSites', () => {
  it('cleans and de-duplicates', () => {
    expect(normalizeBlockedSites(['Shop.com', 'https://shop.com/', 'x y', 'a.ir'])).toEqual([
      'shop.com',
      'a.ir',
    ]);
    expect(normalizeBlockedSites(undefined)).toEqual([]);
    expect(normalizeBlockedSites('shop.com')).toEqual([]);
  });
});

describe('blocklist matching', () => {
  it('matches the domain and its subdomains only', () => {
    expect(domainMatches('shop.com', 'shop.com')).toBe(true);
    expect(domainMatches('www.shop.com', 'shop.com')).toBe(true);
    expect(domainMatches('a.b.shop.com', 'shop.com')).toBe(true);
    expect(domainMatches('notshop.com', 'shop.com')).toBe(false);
    expect(domainMatches('shop.com.evil.net', 'shop.com')).toBe(false);
  });

  it('isBlockedSite checks every entry', () => {
    const list = ['bank.com', 'digikala.com'];
    expect(isBlockedSite('www.digikala.com', list)).toBe(true);
    expect(isBlockedSite('amazon.com', list)).toBe(false);
    expect(isBlockedSite('amazon.com', [])).toBe(false);
  });
});

describe('payment page detection', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('recognises payment gateways by host', () => {
    expect(isPaymentHost('www.paypal.com')).toBe(true);
    expect(isPaymentHost('checkout.stripe.com')).toBe(true);
    expect(isPaymentHost('sadad.shaparak.ir')).toBe(true);
    expect(isPaymentHost('stripe.com')).toBe(false);
    expect(isPaymentHost('amazon.com')).toBe(false);
  });

  it('recognises checkout URLs but not carts', () => {
    expect(isPaymentUrl(new URL('https://shop.com/checkout'))).toBe(true);
    expect(isPaymentUrl(new URL('https://shop.com/checkouts/abc/payment'))).toBe(true);
    expect(isPaymentUrl(new URL('https://shop.com/account/billing'))).toBe(true);
    expect(isPaymentUrl(new URL('https://shop.com/gp/buy/payselect/handlers/display.html'))).toBe(
      true
    );
    expect(isPaymentUrl(new URL('https://shop.com/Checkout.aspx'))).toBe(true);
    expect(isPaymentUrl(new URL('https://pay.shop.com/'))).toBe(true);
    expect(isPaymentUrl(new URL('https://shop.com/cart'))).toBe(false);
    expect(isPaymentUrl(new URL('https://shop.com/payphone-cases'))).toBe(false);
    expect(isPaymentUrl(new URL('https://shop.com/product/checkout-counter-toy'))).toBe(false);
  });

  it('recognises card forms in the page', () => {
    document.body.innerHTML = '<form><input autocomplete="cc-number"></form>';
    expect(detectPaymentPage(new URL('https://shop.com/'), document)).toEqual({
      payment: true,
      reason: 'card form',
    });
    document.body.innerHTML = '<div>Total $5.99</div>';
    expect(detectPaymentPage(new URL('https://shop.com/'), document)).toEqual({
      payment: false,
      reason: null,
    });
    document.body.innerHTML = '<iframe src="https://js.stripe.com/v3/elements"></iframe>';
    expect(detectPaymentPage(new URL('https://shop.com/'), document).payment).toBe(true);
  });

  it('reports the strongest signal first', () => {
    expect(detectPaymentPage(new URL('https://www.paypal.com/checkout'), document).reason).toBe(
      'payment gateway'
    );
    expect(detectPaymentPage(new URL('https://shop.com/checkout'), document).reason).toBe(
      'checkout page'
    );
  });
});
