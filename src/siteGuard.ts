/**
 * Site guard: user blocklist and payment-page detection.
 *
 * Both keep the extension away from pages where rewriting prices is unwanted
 * or risky. The blocklist (`storage.sync.blockedSites`) is a list of domains
 * the user added from the popup; a domain blocks itself and every subdomain.
 * Payment pages (checkout, card forms, payment gateways) are detected from the
 * URL, the host and the presence of card-entry fields, and are left untouched
 * when `pauseOnPayment` is on (the default) so the amount a person is about to
 * pay is always shown exactly as the site states it.
 */

/** Normalise user input ("https://www.Shop.com/x", "shop.com") to a bare domain. */
export function normalizeDomain(input: string): string {
  let value = String(input || '')
    .trim()
    .toLowerCase();
  if (!value) {
    return '';
  }
  if (/^[a-z]+:\/\//.test(value)) {
    try {
      value = new URL(value).hostname;
    } catch {
      return '';
    }
  }
  value = value
    .split(/[/?#:]/)[0]
    .replace(/^www\./, '')
    .replace(/\.+$/, '');
  return /^[a-z0-9.-]+$/.test(value) ? value : '';
}

export function normalizeBlockedSites(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  for (const entry of raw) {
    const domain = normalizeDomain(String(entry));
    if (domain) {
      seen.add(domain);
    }
  }
  return [...seen];
}

/** True when `hostname` is `domain` or a subdomain of it. */
export function domainMatches(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  return host === domain || host.endsWith(`.${domain}`);
}

export function isBlockedSite(hostname: string, blockedSites: string[]): boolean {
  return blockedSites.some(domain => domainMatches(hostname, domain));
}

// Payment processors and gateways. Everything on these hosts is a payment
// page, whatever the path.
const PAYMENT_HOSTS: string[] = [
  'paypal.com',
  'paypal.me',
  'checkout.stripe.com',
  'js.stripe.com',
  'pay.google.com',
  'pay.amazon.com',
  'payments.amazon.com',
  'checkout.shopify.com',
  'shop.app',
  'klarna.com',
  'afterpay.com',
  'clearpay.co.uk',
  'affirm.com',
  'adyen.com',
  'braintreegateway.com',
  'braintreepayments.com',
  'checkout.com',
  '2checkout.com',
  'paddle.com',
  'mollie.com',
  'worldpay.com',
  'authorize.net',
  'squareup.com',
  'square.link',
  'payoneer.com',
  'skrill.com',
  'wise.com',
  'venmo.com',
  'cash.app',
  'alipay.com',
  'pay.weixin.qq.com',
  'paytm.com',
  'razorpay.com',
  'payu.in',
  'payu.com',
  'mercadopago.com',
  'pagseguro.uol.com.br',
  'iyzico.com',
  // Iranian gateways: every bank gateway lives under shaparak.ir
  'shaparak.ir',
  'zarinpal.com',
  'idpay.ir',
  'payping.ir',
  'nextpay.ir',
  'zibal.ir',
  'sep.ir',
  'behpardakht.com',
];

// Path segments (or host labels) that mark a checkout / payment step.
// Matched as whole segments so product slugs like "checkout-counter-toy" do
// not count. "cart" is deliberately absent: a basket is still browsing.
const PAYMENT_SEGMENTS = new Set([
  'checkout',
  'checkouts',
  'payment',
  'payments',
  'pay',
  'billing',
  'purchase',
  'order-confirm',
  'place-order',
  'secure-checkout',
  'payselect',
]);

// Card-entry fields. Sites that render their own card form (no gateway
// redirect) are recognised by these.
const CARD_FIELD_SELECTOR = [
  'input[autocomplete="cc-number"]',
  'input[autocomplete="cc-csc"]',
  'input[autocomplete="cc-exp"]',
  'input[name*="cardnumber" i]',
  'input[name*="card_number" i]',
  'input[name*="card-number" i]',
  'input[name*="creditcard" i]',
  'input[name*="cvv" i]',
  'input[name*="cvc" i]',
  'input[id*="cardnumber" i]',
  'input[id*="card-number" i]',
  'input[id*="card_number" i]',
  'iframe[src*="js.stripe.com"]',
  'iframe[src*="braintreegateway.com"]',
  'iframe[src*="paypal.com"]',
  'iframe[src*="adyen.com"]',
  'iframe[src*="checkout.com"]',
].join(',');

export interface PaymentSignal {
  payment: boolean;
  /** what triggered it, for the popup ("payment gateway", "checkout URL", "card form") */
  reason: string | null;
}

export function isPaymentHost(hostname: string): boolean {
  return PAYMENT_HOSTS.some(domain => domainMatches(hostname, domain));
}

export function isPaymentUrl(url: URL | Location): boolean {
  const segments = url.pathname
    .toLowerCase()
    .split('/')
    .map(seg => seg.replace(/\.(html?|php|aspx?|jsp)$/, ''));
  // Subdomain labels only: "pay.shop.com" yes, "pay.com" itself no.
  const labels = url.hostname.toLowerCase().split('.').slice(0, -2);
  return [...segments, ...labels].some(part => PAYMENT_SEGMENTS.has(part));
}

export function hasCardForm(root: ParentNode): boolean {
  try {
    return root.querySelector(CARD_FIELD_SELECTOR) !== null;
  } catch {
    return false;
  }
}

export function detectPaymentPage(
  location: URL | Location = window.location,
  root: ParentNode = document
): PaymentSignal {
  if (isPaymentHost(location.hostname)) {
    return { payment: true, reason: 'payment gateway' };
  }
  if (isPaymentUrl(location)) {
    return { payment: true, reason: 'checkout page' };
  }
  if (hasCardForm(root)) {
    return { payment: true, reason: 'card form' };
  }
  return { payment: false, reason: null };
}
