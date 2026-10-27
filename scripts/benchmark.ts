import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import snapshot from '../lib/catalogue.json';
import { cataloguePage } from '../lib/catalogue-view';
import { singleFlight } from '../lib/single-flight';
import { interactiveResult } from '../lib/interactive-refresh';
import type { Movie } from '../lib/model';
const percentile = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
const results = [];
for (const size of [snapshot.length, 1000, 5000, 10000]) {
  const films = Array.from({ length: size }, (_, i) => ({
    ...snapshot[i % snapshot.length],
    id: String(i + 1),
    title: `${String(i).padStart(5, '0')} ${snapshot[i % snapshot.length].title}`,
  })) as Movie[];
  const timings = [];
  for (let run = 0; run < 20; run++) {
    const started = performance.now();
    cataloguePage(films, { filter: 'all', sort: 'release' }, '2026-10-26');
    timings.push(performance.now() - started);
  }
  const first = JSON.stringify(cataloguePage(films, {}, '2026-10-26'));
  results.push({
    size,
    samples: 20,
    p50Ms: percentile(timings, 0.5),
    p95Ms: percentile(timings, 0.95),
    pageBytes: Buffer.byteLength(first),
    pageGzipBytes: gzipSync(first).length,
    hydrationQueries: Math.ceil(size / 200),
  });
}
let rebuilds = 0;
const started = performance.now();
await Promise.all(
  Array.from({ length: 20 }, () =>
    singleFlight('benchmark', async () => {
      rebuilds++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return snapshot.length;
    }),
  ),
);
const rebuildMs = performance.now() - started;
const refresh = [];
const pending: Promise<unknown>[] = [];
for (let i = 0; i < 4; i++) {
  const begin = performance.now();
  const work = new Promise<number>((resolve) => setTimeout(() => resolve(1), 2000));
  pending.push(work);
  const result = await interactiveResult(work, 1500);
  refresh.push({ ready: result.ready, waitMs: performance.now() - begin });
}
await Promise.all(pending);
const report = {
  measuredAt: new Date().toISOString(),
  scope:
    'Local CPU/serialization and controlled-delay fixtures; not production capacity or provider latency',
  catalogue: results,
  concurrentRebuild: { callers: 20, rebuilds, fixtureDelayMs: 50, wallMs: rebuildMs },
  interactiveRefresh: {
    samples: refresh.length,
    sourceDelayMs: 2000,
    budgetMs: 1500,
    p50Ms: percentile(
      refresh.map((v) => v.waitMs),
      0.5,
    ),
    p95Ms: percentile(
      refresh.map((v) => v.waitMs),
      0.95,
    ),
  },
  decisions: [
    'Coalesce identical catalogue rebuilds; retain current bounded hydration for present scale.',
    'Return last-good details after a 1.5 second interactive wait and poll the committed background result.',
    'Production warm/cold p50/p95 and cold database hydration remain deployment acceptance checks.',
  ],
};
await mkdir('docs/measurements', { recursive: true });
await writeFile(
  'docs/measurements/implementation-2026-10-26.json',
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report, null, 2));
