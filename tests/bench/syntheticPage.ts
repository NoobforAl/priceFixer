/** Synthetic listing page shared by the bench suites (not a test itself). */

export const CARDS = 3000;

export function card(i: number): string {
  const n = 10 + (i % 90);

  return `<div class="card" id="c${i}">
    <h3>Product ${i}</h3>
    <p class="desc">Lorem ipsum dolor sit amet, ships in 15 days, save 25% today. Order #${100000 + i}, call 555-0${i % 1000}.</p>
    <div class="price"><span>$</span><span>${n}</span><span>.</span><span>99</span></div>
    <span class="old">Was $${n + 50}.99</span>
    <span class="rating">4.5 (1,234 reviews)</span>
    <ul><li>Feature one</li><li>Feature two</li><li>${i % 3 === 0 ? '€1.299,99' : 'no price here'}</li></ul>
  </div>`;
}

export function buildPage(cards = CARDS): string {
  let html = '<main>';

  for (let i = 0; i < cards; i++) {
    html += card(i);
  }

  return `${html}</main>`;
}

export const tick = (): Promise<void> => new Promise(r => setTimeout(r, 0));

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);

  return s[Math.floor(s.length / 2)];
}

export function fmt(xs: number[]): string {
  return `${median(xs).toFixed(0)} ms (min ${Math.min(...xs).toFixed(0)})`;
}
