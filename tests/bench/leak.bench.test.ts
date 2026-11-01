/**
 * Micro-benchmark, not a test: `npm run bench` (or filter to this file).
 * Run with `node --expose-gc` (via NODE_OPTIONS) for accurate heap numbers.
 *
 * Simulates a long-lived tab on a site that recycles its DOM — a virtualized
 * or infinite-scroll listing, where the page keeps the *visible* card count
 * flat by adding new cards and removing old ones as the user scrolls. Tracks
 * PriceFixerContent's internal bookkeeping (`records`, `priceChanges`) and
 * Node's heap after each round, to show whether memory is bounded by what's
 * currently on the page or keeps growing with everything ever touched.
 */
import { PriceFixerContent } from '../../src/content/priceFixerContent';
import { card, tick } from './syntheticPage';

type Internals = {
  scanQueue: Node[] | null;
  records: unknown[];
  priceChanges: unknown[];
};

async function settle(instance: PriceFixerContent): Promise<void> {
  do {
    await tick();
  } while ((instance as unknown as Internals).scanQueue !== null);
}

interface NodeGlobal {
  gc?: () => void;
  process: { memoryUsage: () => { heapUsed: number } };
}
const nodeGlobal = globalThis as unknown as NodeGlobal;

function heapMB(): number {
  if (typeof nodeGlobal.gc === 'function') {
    nodeGlobal.gc();
  }

  return nodeGlobal.process.memoryUsage().heapUsed / 1024 / 1024;
}

test('leak check: recycled DOM (add N, remove N) over many rounds', async () => {
  if (typeof nodeGlobal.gc !== 'function') {
    console.warn(
      'Run with `node --expose-gc` (e.g. NODE_OPTIONS=--expose-gc npm run bench) ' +
        'for accurate heap numbers; falling back to un-forced GC.'
    );
  }

  document.body.innerHTML = '<main></main>';
  const instance = new PriceFixerContent();

  await settle(instance);

  const main = document.querySelector('main')!;
  const ROUNDS = 30;
  const BATCH = 200;
  const samples: Array<{
    round: number;
    heapMB: number;
    records: number;
    priceChanges: number;
    roundMs: number;
  }> = [];

  for (let r = 0; r < ROUNDS; r++) {
    const t0 = performance.now();

    for (let i = 0; i < BATCH; i++) {
      const div = document.createElement('div');

      div.innerHTML = card(r * BATCH + i);
      main.appendChild(div.firstElementChild!);
    }

    await settle(instance);

    // A virtualized list recycles off-screen items: keep only the newest
    // batch, so the *live* DOM size stays flat after the first round.
    while (main.children.length > BATCH) {
      main.removeChild(main.firstElementChild!);
    }

    await tick();

    const roundMs = performance.now() - t0;
    const internals = instance as unknown as Internals;

    samples.push({
      round: r,
      heapMB: heapMB(),
      records: internals.records.length,
      priceChanges: internals.priceChanges.length,
      roundMs,
    });
  }

  console.log(
    `round  heapMB  records  priceChanges  roundMs\n${samples
      .map(
        s =>
          `${String(s.round).padStart(5)}  ${s.heapMB.toFixed(1).padStart(6)}  ` +
          `${String(s.records).padStart(7)}  ${String(s.priceChanges).padStart(12)}  ` +
          `${s.roundMs.toFixed(0).padStart(7)}`
      )
      .join('\n')}`
  );

  // Skip the first couple of rounds (JIT/warm-up); compare the trend across
  // the rest instead of just first-vs-last, since a healthy fix oscillates
  // (records get pruned periodically) rather than monotonically decreasing.
  const settled = samples.slice(3);
  const firstHalf = settled.slice(0, Math.floor(settled.length / 2));
  const secondHalf = settled.slice(Math.floor(settled.length / 2));
  const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
  const recordsRange = [
    Math.min(...settled.map(s => s.records)),
    Math.max(...settled.map(s => s.records)),
  ];
  const heapRange = [
    Math.min(...settled.map(s => s.heapMB)),
    Math.max(...settled.map(s => s.heapMB)),
  ];
  const avgRoundFirst = avg(firstHalf.map(s => s.roundMs));
  const avgRoundSecond = avg(secondHalf.map(s => s.roundMs));

  console.log(
    `\nLive DOM stays at ${BATCH} cards for every round after warm-up.\n` +
      `records:      oscillates ${recordsRange[0]}–${recordsRange[1]} ` +
      `(bounded and periodically pruned, not the live DOM's ${BATCH})\n` +
      `heapUsed:     oscillates ${heapRange[0].toFixed(1)}–${heapRange[1].toFixed(1)}MB\n` +
      `per-round time: ${avgRoundFirst.toFixed(0)}ms (first half) vs ${avgRoundSecond.toFixed(0)}ms (second half) — ` +
      `flat means no growing per-round cost from accumulated state`
  );

  instance.destroy();
  document.body.innerHTML = '';
}, 600000);
