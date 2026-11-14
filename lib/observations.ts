/** Fixed low-cardinality histograms contain no film IDs, URLs, queries or account data. */
export const TIMING_BOUNDS_MS = [
  25, 50, 100, 150, 250, 500, 750, 1000, 1500, 2000, 3000, 5000, 10000, 30000, 60000, 120000,
  300000, 600000, 1200000, 1800000, 3600000, 21600000, 86400000, 604800000, 2592000000,
] as const;
export const TIMING_NAMES = [
  'visitor_movie',
  'visitor_catalogue',
  'visitor_library',
  'visitor_search',
  'visitor_release_history',
  'background_detail_poll',
  'lookup_source',
  'lookup_cached',
  'discovered_to_published',
  'source_modified_to_published',
  'refresh_job',
] as const;
export type TimingName = (typeof TIMING_NAMES)[number];
export const COUNTER_NAMES = [
  'api_requests',
  'api_errors',
  'throttled',
  'sign_in_emails',
  'catalogue_preview_unavailable',
  'feed_cache_hit',
  'feed_cache_miss',
  'refresh_jobs',
  'refresh_failures',
  'source_failures',
  'refreshed_movies',
] as const;
export type Timing = { name: TimingName; durationMs: number };
export const observationKey = (day: string) => `alist:observations:v1:${day}`;
export function observationFields(counters: Record<string, number>, timings: Timing[] = []) {
  const fields: Record<string, number> = {};
  for (const [name, count] of Object.entries(counters))
    if (
      COUNTER_NAMES.includes(name as (typeof COUNTER_NAMES)[number]) &&
      Number.isSafeInteger(count) &&
      count > 0
    )
      fields[`count:${name}`] = count;
  for (const { name, durationMs } of timings) {
    if (!TIMING_NAMES.includes(name) || !Number.isFinite(durationMs) || durationMs < 0) continue;
    const index = TIMING_BOUNDS_MS.findIndex((bound) => durationMs <= bound);
    const key = `time:${name}:${index < 0 ? TIMING_BOUNDS_MS.length : index}`;
    fields[key] = (fields[key] || 0) + 1;
  }
  return fields;
}
export function requestObservation(
  family: string,
  poll: boolean,
  status: number,
  durationMs: number,
) {
  const name = family === 'movie' && poll ? 'background_detail_poll' : `visitor_${family}`;
  return {
    counters: { api_requests: 1, ...(status >= 500 ? { api_errors: 1 } : {}) },
    timings:
      status >= 200 && status < 300 && TIMING_NAMES.includes(name as TimingName)
        ? [{ name: name as TimingName, durationMs }]
        : [],
  };
}
export function observationSnapshot(raw: Record<string, unknown> | null) {
  if (
    !raw ||
    typeof raw._generation !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(raw._generation)
  )
    return null;
  const version = Number(raw._version);
  if (!Number.isSafeInteger(version) || version < 1) return null;
  const fields: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) continue;
    const count = Number(value);
    if (!Number.isSafeInteger(count) || count < 0) continue;
    const parts = key.split(':');
    const [kind, name, bin] = parts;
    if (
      (parts.length === 2 &&
        kind === 'count' &&
        COUNTER_NAMES.includes(name as (typeof COUNTER_NAMES)[number]) &&
        !bin) ||
      (parts.length === 3 &&
        kind === 'time' &&
        TIMING_NAMES.includes(name as TimingName) &&
        /^\d+$/.test(bin || '') &&
        Number(bin) <= TIMING_BOUNDS_MS.length)
    )
      fields[key] = count;
  }
  return { generation: raw._generation, version, fields };
}
export function observationSummary(snapshots: { fields: Record<string, number> }[]) {
  const totals: Record<string, number> = {};
  for (const { fields } of snapshots)
    for (const [key, value] of Object.entries(fields)) totals[key] = (totals[key] || 0) + value;
  const counters = Object.fromEntries(
    COUNTER_NAMES.map((name) => [name, totals[`count:${name}`] || 0]),
  );
  const timings = Object.fromEntries(
    TIMING_NAMES.map((name) => {
      const bins = Array.from(
        { length: TIMING_BOUNDS_MS.length + 1 },
        (_, i) => totals[`time:${name}:${i}`] || 0,
      );
      const samples = bins.reduce((a, b) => a + b, 0);
      const percentile = (p: number) => {
        if (!samples) return null;
        let count = 0;
        for (let i = 0; i < bins.length; i++) {
          count += bins[i];
          if (count >= Math.ceil(samples * p)) return TIMING_BOUNDS_MS[i] ?? null;
        }
        return null;
      };
      return [
        name,
        {
          samples,
          p50UpperMs: percentile(0.5),
          p95UpperMs: percentile(0.95),
          overflow: bins.at(-1) || 0,
        },
      ];
    }).filter(([, value]) => typeof value === 'object' && value.samples),
  );
  return { counters, timings };
}
