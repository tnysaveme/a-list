import type { FeedEntry } from './release-automation';
export function releasePipelineTiming(entry: FeedEntry, publishedAt = Date.now()) {
  const queued = Date.parse(entry.queuedAt || entry.seenAt);
  const modified = Date.parse(entry.sourceModifiedAt || entry.report.publishedAt || '');
  if (!Number.isFinite(queued) || queued > publishedAt) return null;
  return {
    event: 'release_pipeline_timing',
    sourceId: entry.sourceId,
    queueLagMs: publishedAt - queued,
    ...(Number.isFinite(modified) && modified <= publishedAt
      ? { sourceLagMs: publishedAt - modified }
      : {}),
  };
}
export function timingSummary(values: readonly number[]) {
  const sorted = values
    .filter((value) => Number.isFinite(value) && value >= 0)
    .toSorted((a, b) => a - b);
  const percentile = (p: number) =>
    sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] : null;
  return {
    samples: sorted.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    maxMs: sorted.at(-1) ?? null,
  };
}
