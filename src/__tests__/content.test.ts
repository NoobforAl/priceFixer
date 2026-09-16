import { PriceFixerContent } from '../priceFixerContent';

const tick = (): Promise<void> => new Promise(r => setTimeout(r, 10));

const instances: PriceFixerContent[] = [];

async function boot(html: string): Promise<PriceFixerContent> {
  document.body.innerHTML = html;
  const instance = new PriceFixerContent();
  instances.push(instance);
  await tick();
  return instance;
}

afterEach(() => {
  for (const instance of instances.splice(0)) {
    instance.destroy();
  }
  document.body.innerHTML = '';
});

describe('highlight mode', () => {
  test('wraps prices and leaves textContent as the honest price', async () => {
    await boot('<div class="price">now $149.99</div>');
    const wrapper = document.querySelector('.pf-highlight') as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.getAttribute('data-pf-original')).toBe('$149.99');
    expect(wrapper.textContent).toBe('$150');
    expect(document.querySelector('.price')!.textContent).toBe('now $150');
    // no tooltip text leaks into the page content
    expect(document.body.textContent).not.toContain('Charm pricing');
  });

  test('restore puts the exact original DOM back, keeping sibling elements', async () => {
    const html =
      '<p id="a">was $199.99 <b>limited</b> offer. Ships in 15 days <button>Add to cart</button> only $5.99</p>';
    const instance = await boot(html);
    expect(document.querySelectorAll('.pf-highlight')).toHaveLength(2);
    expect(document.querySelector('button')).not.toBeNull();

    instance.restoreOriginal();
    expect(document.body.innerHTML).toBe(html);
  });

  test('restore twice / after site re-render does not throw', async () => {
    const instance = await boot('<span class="p">$5.99</span>');
    document.querySelector('.p')!.remove();
    expect(() => instance.restoreOriginal()).not.toThrow();
    expect(() => instance.restoreOriginal()).not.toThrow();
  });

  test('detects a price split across child elements', async () => {
    await boot(
      '<span class="a-price"><span class="sym">$</span><span class="whole">5<span class="dec">.</span></span><span class="frac">99</span></span>'
    );
    const price = document.querySelector('.a-price')!;
    expect(price.textContent).toBe('$6');
    expect(price.querySelector('.pf-highlight')!.getAttribute('data-pf-original')).toBe('$5.99');
  });

  test('does not merge screen-reader-only text with the visible split price (Amazon)', async () => {
    const sr = 'position:absolute;clip:rect(1px,1px,1px,1px);width:1px;height:1px;overflow:hidden';
    await boot(
      `<span class="a-price"><span class="a-offscreen" style="${sr}">$9.99</span>` +
        '<span aria-hidden="true"><span class="a-price-whole">9<span class="a-price-decimal">.</span></span><span class="a-price-fraction">99</span></span></span>'
    );
    expect(document.querySelector('.a-offscreen')!.textContent).toBe('$10');
    expect(document.querySelector('[aria-hidden]')!.textContent).toBe('10');
    expect(document.body.textContent).not.toContain('1.000.000');
  });

  test('highlight shows only the rounded price; original lives in data attribute', async () => {
    await boot('<span class="p">$5.99</span>');
    const w = document.querySelector('.pf-highlight')!;
    expect(w.textContent).toBe('$6');
    expect(w.getAttribute('data-pf-original')).toBe('$5.99');
  });

  test('Persian grouped amount next to a currency icon is a price (Digikala)', async () => {
    const html =
      '<div class="price"><span class="n">۱,۶۹۹,۰۰۰</span><svg width="10" height="10"></svg></div>' +
      '<div class="rating"><span>۴.۵</span><svg></svg></div>' +
      '<div class="count"><span>۴۹,۰۶۰ کالا</span><svg></svg></div>' +
      '<div class="plain"><span>1,699,000</span><svg></svg></div>';
    const instance = await boot(html);
    expect(document.querySelector('.price')!.textContent).toBe('۱,۷۰۰,۰۰۰');
    expect(document.querySelector('.rating')!.textContent).toBe('۴.۵');
    expect(document.querySelector('.count')!.textContent).toBe('۴۹,۰۶۰ کالا');
    expect(document.querySelector('.plain')!.textContent).toBe('1,699,000');
    instance.restoreOriginal();
    expect(document.body.innerHTML).toBe(html);
  });

  test('ASCII grouped amount next to an icon counts only on RTL pages', async () => {
    document.documentElement.lang = 'fa';
    try {
      await boot('<div class="price"><span>1,699,000</span><svg></svg></div>');
      expect(document.querySelector('.price')!.textContent).toBe('1,700,000');
    } finally {
      document.documentElement.lang = '';
    }
  });

  test('detects superscript cents without a separator', async () => {
    await boot('<div class="price">$<span>19</span><sup>99</sup></div>');
    expect(document.querySelector('.price')!.textContent).toBe('$20');
  });

  test('restores split prices to their original children', async () => {
    const html =
      '<span class="a-price"><span class="sym">$</span><span class="whole">5.</span><span class="frac">99</span></span>';
    const instance = await boot(html);
    expect(document.querySelector('.a-price')!.textContent).toBe('$6');
    instance.restoreOriginal();
    expect(document.body.innerHTML).toBe(html);
  });

  test('split price in a shared container (Walmart): digits node hosts the price, restore is exact', async () => {
    const html =
      '<span class="flex"><span class="w">Now</span><span class="sym">$</span><span class="big">11</span><span class="cents">87</span></span>';
    const instance = await boot(html);
    const big = document.querySelector('.big')!;
    expect(big.querySelector('.pf-highlight')!.textContent).toBe('$12');
    expect(document.querySelector('.sym')!.textContent).toBe('');
    expect(document.querySelector('.cents')!.textContent).toBe('');
    expect(document.querySelector('.flex')!.textContent).toBe('Now$12');
    instance.restoreOriginal();
    expect(document.body.innerHTML).toBe(html);
  });

  test('neighbouring price and unit price in one container do not fuse (Walmart)', async () => {
    await boot(
      '<div class="p"><span class="flex"><span>Now</span><span>$</span><span>11</span><span>87</span></span>' +
        '<span class="strike"><span>$</span><span>20.99</span></span><span class="unit">57.8 ¢/ea</span></div>'
    );
    expect(document.querySelector('.p')!.textContent).toBe('Now$12$2157.8 ¢/ea');
  });

  test('split price with partially covered edge nodes keeps surrounding text', async () => {
    const html = '<span>Only $<b>5</b>.99 today</span>';
    const instance = await boot(html);
    expect(document.querySelector('span')!.textContent).toBe('Only $6 today');
    instance.restoreOriginal();
    expect(document.body.innerHTML).toBe(html);
  });

  test('skips editable, code, option and script content', async () => {
    const html =
      '<div contenteditable="true">$5.99</div><code>$5.99</code><select><option>$5.99</option></select><script>var a="$5.99"</script>';
    await boot(html);
    expect(document.querySelector('.pf-highlight')).toBeNull();
  });

  test('ignores non-price numbers', async () => {
    const html = '<p>Copyright 2024. Call 555-1234. Ships in 15 days. Save 25%. Ages 3-12.</p>';
    await boot(html);
    expect(document.body.innerHTML).toBe(html);
  });

  test('processes dynamically added content once and does not loop', async () => {
    await boot('<div id="root"></div>');
    const root = document.getElementById('root')!;
    root.innerHTML = '<span class="p">$9.99</span>';
    await tick();
    await tick();
    expect(document.querySelectorAll('.pf-highlight')).toHaveLength(1);
    expect(document.querySelector('.p')!.textContent).toBe('$10');
  });

  test('restore is not undone by the mutation observer', async () => {
    const instance = await boot('<span class="p">$5.99</span>');
    instance.restoreOriginal();
    await tick();
    await tick();
    expect(document.querySelector('.pf-highlight')).toBeNull();
    expect(document.querySelector('.p')!.textContent).toBe('$5.99');
  });
});

describe('replace mode', () => {
  test('replaces text in place and restores it', async () => {
    document.body.innerHTML = '<p>Was $199.99, now $149.99 <b>x</b></p>';
    const instance = new PriceFixerContent();
    instances.push(instance);
    (instance as unknown as { displayMode: string }).displayMode = 'replace';
    (instance as unknown as { reprocessPage: () => void }).reprocessPage();
    expect(document.querySelector('p')!.innerHTML).toBe('Was $200, now $150 <b>x</b>');
    instance.restoreOriginal();
    expect(document.querySelector('p')!.innerHTML).toBe('Was $199.99, now $149.99 <b>x</b>');
  });
});
