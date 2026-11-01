/**
 * Micro-benchmark, not a test: `npm run bench`.
 *
 * The custom rounding step (see roundToStep in pricePatterns.ts) rounds every
 * matched price, not just charm prices, so a page that used to have only a
 * handful of highlights can end up with nearly all of its prices rewritten.
 * This compares the default charm-only rule against a custom step on the
 * same synthetic page, to catch any regression from the extra DOM writes.
 */
import { PriceFixerContent } from '../../src/content/priceFixerContent';
import { CARDS, card, buildPage, tick, fmt } from './syntheticPage';

const ROUNDS = 3;

type Internals = {
  scanQueue: Node[] | null;
  roundingStep: number | null;
};

async function settle(instance: PriceFixerContent): Promise<void> {
  do {
    await tick();
  } while ((instance as unknown as Internals).scanQueue !== null);
}

interface RunResult {
  initial: number[];
  mutation: number[];
  highlights: number;
}

/** Scans the synthetic page once per round with the given rounding step. */
async function run(roundingStep: number | null): Promise<RunResult> {
  const html = buildPage();
  const initial: number[] = [];
  const mutation: number[] = [];
  let highlights = 0;

  for (let r = 0; r < ROUNDS; r++) {
    document.body.innerHTML = html;
    const t0 = performance.now();
    const instance = new PriceFixerContent();

    // No storage in jsdom, so this beats the constructor's own async init
    // (see loadSettings: it returns immediately when there is no chrome API).
    (instance as unknown as Internals).roundingStep = roundingStep;
    await settle(instance);
    initial.push(performance.now() - t0);
    highlights = document.querySelectorAll('.pf-highlight').length;

    const main = document.querySelector('main')!;
    const t1 = performance.now();

    for (let i = 0; i < 200; i++) {
      const div = document.createElement('div');

      div.innerHTML = card(CARDS + i);
      main.appendChild(div.firstElementChild!);
    }

    await settle(instance);
    mutation.push(performance.now() - t1);

    instance.destroy();
    document.body.innerHTML = '';
  }

  return { initial, mutation, highlights };
}

test('benchmark: custom rounding step vs default charm-only', async () => {
  const baseline = await run(null);
  // step=1 makes every whole-dollar price eligible, not just ones ending in 9.
  const stepped = await run(1);

  console.log(
    `cards=${CARDS}\n` +
      `  default (charm only)       highlights=${baseline.highlights}\n` +
      `    initial scan : ${fmt(baseline.initial)}\n` +
      `    200 mutations: ${fmt(baseline.mutation)}\n` +
      `  custom step=1 (all prices) highlights=${stepped.highlights}\n` +
      `    initial scan : ${fmt(stepped.initial)}\n` +
      `    200 mutations: ${fmt(stepped.mutation)}`
  );
}, 600000);
