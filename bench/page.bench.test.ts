/**
 * Micro-benchmark, not a test: `npm run bench`.
 * Times the initial scan of a large synthetic listing and a mutation burst.
 */
import { PriceFixerContent } from '../src/priceFixerContent';

const CARDS = 3000;
const ROUNDS = 3;

function card(i: number): string {
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

function buildPage(): string {
  let html = '<main>';
  for (let i = 0; i < CARDS; i++) {
    html += card(i);
  }
  return html + '</main>';
}

const tick = (): Promise<void> => new Promise(r => setTimeout(r, 0));
type Sliced = { scanQueue: Node[] | null; reprocessPage: () => void };
/** The scan is time-sliced: wait until the queue is drained. */
async function settle(instance: PriceFixerContent): Promise<void> {
  do {
    await tick();
  } while ((instance as unknown as Sliced).scanQueue !== null);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

test('benchmark', async () => {
  const html = buildPage();
  const initial: number[] = [];
  const mutation: number[] = [];
  const rescan: number[] = [];
  let highlights = 0;

  for (let r = 0; r < ROUNDS; r++) {
    document.body.innerHTML = html;
    const t0 = performance.now();
    const instance = new PriceFixerContent();
    await settle(instance);
    initial.push(performance.now() - t0);
    highlights = document.querySelectorAll('.pf-highlight').length;

    // Mutation burst: 200 new cards appended one by one
    const main = document.querySelector('main')!;
    const t1 = performance.now();
    for (let i = 0; i < 200; i++) {
      const div = document.createElement('div');
      div.innerHTML = card(CARDS + i);
      main.appendChild(div.firstElementChild!);
    }
    await settle(instance);
    mutation.push(performance.now() - t1);

    const t2 = performance.now();
    (instance as unknown as Sliced).reprocessPage();
    await settle(instance);
    rescan.push(performance.now() - t2);

    instance.destroy();
    document.body.innerHTML = '';
  }

  const fmt = (xs: number[]): string =>
    `${median(xs).toFixed(0)} ms (min ${Math.min(...xs).toFixed(0)})`;
  console.log(
    `cards=${CARDS} highlights=${highlights}\n` +
      `  initial scan : ${fmt(initial)}\n` +
      `  200 mutations: ${fmt(mutation)}\n` +
      `  rescan       : ${fmt(rescan)}`
  );
}, 600000);
