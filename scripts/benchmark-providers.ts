import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import { searchProviders } from '../lib/movie-search';
const queries = ['Filipinana', 'Big Baby', 'The Lost Ones', 'Hunting Matthew Nichols'];
const samples = [];
for (const phase of ['first', 'repeated'])
  for (const query of queries) {
    const started = performance.now();
    try {
      const result = await searchProviders(query);
      samples.push({
        phase,
        query,
        durationMs: performance.now() - started,
        degraded: result.degraded,
        results: result.movies.length,
      });
    } catch {
      samples.push({
        phase,
        query,
        durationMs: performance.now() - started,
        degraded: true,
        results: 0,
      });
    }
    console.log(JSON.stringify(samples.at(-1)));
  }
const percentile = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
const summary = Object.fromEntries(
  ['first', 'repeated'].map((phase) => {
    const values = samples.filter((v) => v.phase === phase).map((v) => v.durationMs);
    return [
      phase,
      { samples: values.length, p50Ms: percentile(values, 0.5), p95Ms: percentile(values, 0.95) },
    ];
  }),
);
await mkdir('docs/measurements', { recursive: true });
await writeFile(
  'docs/measurements/providers-2026-10-26.json',
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      scope:
        'Read-only live provider searches from this machine. Repeated requests do not measure the Next/Redis cache, authenticated API or production concurrency.',
      samples,
      summary,
    },
    null,
    2,
  ) + '\n',
);
