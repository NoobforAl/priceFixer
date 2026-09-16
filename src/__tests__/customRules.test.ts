import { compileRules, normalizeRules } from '../customRules';
import { PriceFixerContent } from '../priceFixerContent';

describe('custom rules', () => {
  test('normalizes sloppy input and reports compile errors', () => {
    const rules = normalizeRules({
      excludeSelectors: { '*': [' .unit ', ''], 'shop.com': ['#total'] },
      excludePatterns: [String.raw`per\s+month`, '(('],
      extraPatterns: [String.raw`(?<amount>\d+)\s*coins`, 'no group here'],
    });
    const compiled = compileRules(rules, 'shop.com');
    expect(compiled.excludeSelector).toBe('.unit, #total');
    expect(compiled.excludePatterns).toHaveLength(1);
    expect(compiled.extraPatterns).toHaveLength(1);
    expect(compiled.errors).toHaveLength(2);
    expect(compileRules(rules, 'other.com').excludeSelector).toBe('.unit');
  });

  test('rules are applied by the page engine', () => {
    document.body.innerHTML =
      '<p class="a">$5.99</p><p class="unit">$5.99 per unit</p><p class="b">$5.99 per month</p><p class="c">199 coins</p>';
    const instance = new PriceFixerContent();
    instance.applyRules({
      excludeSelectors: { '*': ['.unit'] },
      excludePatterns: [String.raw`per\s+month`],
      extraPatterns: [String.raw`(?<amount>\d+)\s*coins`],
    });
    (instance as unknown as { reprocessPage: () => void }).reprocessPage();
    expect(document.querySelector('.a')!.textContent).toBe('$6');
    expect(document.querySelector('.unit')!.textContent).toBe('$5.99 per unit');
    expect(document.querySelector('.b')!.textContent).toBe('$5.99 per month');
    expect(document.querySelector('.c')!.textContent).toBe('200 coins');
    instance.destroy();
    instance.applyRules(null);
  });
});
