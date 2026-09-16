import { PricePatterns } from '../pricePatterns';

function fix(text: string): string {
  const matches = PricePatterns.findPrices(text);
  let out = text;
  for (const m of [...matches].reverse()) {
    const rounded = PricePatterns.roundUpPrice(m.value);
    if (rounded === m.value) {
      continue;
    }
    out =
      out.slice(0, m.startIndex) + PricePatterns.formatPrice(rounded, m) + out.slice(m.endIndex);
  }
  return out;
}

describe('detection', () => {
  test.each([
    ['$5.99', 5.99, 'DOLLAR'],
    ['€5.99', 5.99, 'EUR'],
    ['£1,299.99', 1299.99, 'GBP'],
    ['¥1,980', 1980, 'YEN'],
    ['₹499', 499, 'INR'],
    ['5,99 €', 5.99, 'EUR'],
    ['1.299€', 1299, 'EUR'],
    ['Ab 1.299 €', 1299, 'EUR'],
    ['299 EUR', 299, 'EUR'],
    ['USD 12.99', 12.99, 'USD'],
    ['US$ 1,234.56', 1234.56, 'DOLLAR'],
    ['$ 0.99', 0.99, 'DOLLAR'],
    ['$1000', 1000, 'DOLLAR'],
    ['$۱۹۹', 199, 'DOLLAR'],
    ['۱٬۲۹۹٬۰۰۰ تومان', 1299000, 'IRT'],
    ['۹۹٬۹۰۰ ریال', 99900, 'IRR'],
    ['￥99.00', 99, 'YEN'],
    ['99元', 99, 'CNY'],
    ['1.999円', 1999, 'JPY'],
    ['49,99 zł', 49.99, 'PLN'],
    ['1 299 Kč', 1299, 'CZK'],
    ['5 000 €', 5000, 'EUR'],
    ['299 kr', 299, 'KR'],
    ['₺49,99', 49.99, 'TRY'],
    ['Rs. 499', 499, 'INR'],
    ['R$ 19,99', 19.99, 'DOLLAR'],
    ['1.299.000 IDR', 1299000, 'IDR'],
  ])('%s → %s %s', (text, value, currency) => {
    const m = PricePatterns.findPrices(text);
    expect(m).toHaveLength(1);
    expect(m[0].value).toBe(value);
    expect(m[0].currency).toBe(currency);
  });

  test('finds each price in ranges, offers and subscriptions', () => {
    expect(PricePatterns.findPrices('$99.99 - $199.99').map(m => m.value)).toEqual([99.99, 199.99]);
    expect(PricePatterns.findPrices('was $199.99 now $149.99').map(m => m.value)).toEqual([
      199.99, 149.99,
    ]);
    expect(PricePatterns.findPrices('$9.99/month').map(m => m.originalText)).toEqual(['$9.99']);
  });

  test.each([
    'Copyright 2024 Acme Inc',
    'Order #123456',
    'Call 555-1234',
    'Date: 2024-01-15',
    'Ages 3-12',
    'Ships in 15 days',
    'Save 25% today',
    '4.7 out of 5 stars 1,234 ratings',
    'Version 1.2.3',
    'ZIP 90210-1234',
    '12 payments',
    'ab 3 Jahren',
    '2024 Krakow',
    'Krone 5',
  ])('ignores non-price text: %s', text => {
    expect(PricePatterns.findPrices(text)).toEqual([]);
  });

  test('does not match the first 3 digits of a longer number', () => {
    expect(PricePatterns.findPrices('$1099').map(m => m.value)).toEqual([1099]);
  });
});

describe('rounding', () => {
  test.each([
    [5.99, 6],
    [5.95, 6],
    [5.49, 6],
    [0.99, 1],
    [9.99, 10],
    [19.99, 20],
    [149.99, 150],
    [999.99, 1000],
    [19, 20],
    [199, 200],
    [1999, 2000],
    [149, 150],
    [12, 12],
    [10, 10],
    [101, 101],
    [1000, 1000],
    [12.5, 13],
    [9, 9],
    [1299000, 1300000],
    [999000, 1000000],
    [99000, 100000],
    [9000, 9000],
    [19900, 19900],
    [2980, 2980],
    [190, 190],
    [1999000, 2000000],
  ])('%s → %s', (input, expected) => {
    expect(PricePatterns.roundUpPrice(input)).toBe(expected);
  });

  test('difference has no float noise', () => {
    expect(PricePatterns.priceDifference(199.99, 200)).toBe(0.01);
    expect(PricePatterns.priceDifference(5.49, 6)).toBe(0.51);
  });
});

describe('formatting', () => {
  test.each([
    ['$5.99', '$6'],
    ['$149.99', '$150'],
    ['$1,299.99', '$1,300'],
    ['$999.99', '$1,000'],
    ['5,99 €', '6 €'],
    ['1.299,99€', '1.300€'],
    ['Ab 1.299 €', 'Ab 1.300 €'],
    ['299 EUR', '300 EUR'],
    ['USD 12.99', 'USD 13'],
    ['$9.99/month', '$10/month'],
    ['$99.99 - $199.99', '$100 - $200'],
    ['was $199.99 now $149.99', 'was $200 now $150'],
    ['Price: $12.00', 'Price: $12.00'],
    ['Total $101', 'Total $101'],
    ['₹499', '₹500'],
    ['۱٬۲۹۹٬۰۰۰ تومان', '۱٬۳۰۰٬۰۰۰ تومان'],
    ['۹۹۹٬۰۰۰ تومان', '۱٬۰۰۰٬۰۰۰ تومان'],
    ['۱۹٫۹۹ ریال', '۲۰ ریال'],
    ['￥99.00', '￥100'],
    ['￥99.99', '￥100'],
    ['1.999円', '2.000円'],
    ['49,99 zł', '50 zł'],
    ['$999.99', '$1,000'],
    ['999,99 €', '1.000 €'],
    ['1 299 Kč', '1 300 Kč'],
    ['$12,99', '$13'],
    ['RMB 9999', 'RMB 10000'],
    ['1899元', '1900元'],
    ['$1099', '$1100'],
  ])('%s → %s', (input, expected) => {
    expect(fix(input)).toBe(expected);
  });
});
