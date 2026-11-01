/**
 * Micro-benchmark, not a test: `npm run bench`.
 * Times the initial scan of a large synthetic listing and a mutation burst.
 */
import { PriceFixerContent } from '../../src/content/priceFixerContent';
import { CARDS, card, buildPage, tick, fmt } from './syntheticPage';

const ROUNDS = 3;

type Sliced = { scanQueue: Node[] | null; reprocessPage: () => void };
/** The scan is time-sliced: wait until the queue is drained. */
async function settle(instance: PriceFixerContent): Promise<void> {
  do {
    await tick();
  } while ((instance as unknown as Sliced).scanQueue !== null);
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

  console.log(
    `cards=${CARDS} highlights=${highlights}\n` +
      `  initial scan : ${fmt(initial)}\n` +
      `  200 mutations: ${fmt(mutation)}\n` +
      `  rescan       : ${fmt(rescan)}`
  );
}, 600000);
