import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupRetrySeconds, lookupSourceFailure } from '../lib/lookup-retry';
import { releasePipelineTiming, timingSummary } from '../lib/release-timing';
import { sourceHealthSummary } from '../lib/source-health';
import type { FeedEntry } from '../lib/release-automation';
test('persistent markup failures back off without turning local contention into source outages', () => {
  const format = { stage: 'identity' as const, category: 'format_changed', durationMs: 1 };
  assert.equal(lookupRetrySeconds(format, 0, false), 3600);
  assert.equal(lookupRetrySeconds(format, 20, false), 7 * 86400);
  assert.equal(lookupRetrySeconds(format, 20, true), 86400);
  assert.equal(lookupRetrySeconds({ ...format, category: 'http_error' }, 0, false), 600);
  assert.equal(lookupRetrySeconds({ ...format, category: 'http_error' }, 20, false), 6 * 3600);
  for (const diagnostic of [
    { ...format, stage: 'database' as const },
    { ...format, category: 'budget_exhausted' },
    { ...format, category: 'version_conflict' },
  ]) {
    assert.equal(lookupRetrySeconds(diagnostic, 20, true), 60);
    assert.equal(lookupSourceFailure(diagnostic), false);
  }
});
test('per-film failure state survives unrelated provider-wide success', () => {
  const now = Date.now(),
    stamp = new Date(now).toISOString();
  const status = {
    last_success_at: stamp,
    catalogue_success_at: stamp,
    wts_profile_indexed_at: stamp,
    wts_coverage: { checkedAt: stamp },
    wts_profile_changes: { through: stamp, checkedAt: stamp },
    source_health: { wts_feed: { lastSuccess: stamp }, wts_lookup: { ok: true } },
    queues: {
      profiles: { due: 0 },
      announcements: { due: 0 },
      saved: { due: 0 },
      lookups: { due: 0 },
      failureSummary: { lookupUnavailable: 1 },
    },
  };
  assert.deepEqual(sourceHealthSummary(status, now).issues, ['wts_lookup_incomplete']);
  assert.equal(
    sourceHealthSummary(
      { ...status, queues: { ...status.queues, failureSummary: { lookupUnavailable: 0 } } },
      now,
    ).status,
    'healthy',
  );
});
test('freshness timings distinguish source age, queue wait and visitor latency without accepting corrupt clocks', () => {
  const entry = {
    seenAt: '2026-11-13T12:01:00Z',
    sourceModifiedAt: '2026-11-13T12:00:00Z',
    report: {},
  } as FeedEntry;
  assert.deepEqual(releasePipelineTiming(entry, Date.parse('2026-11-13T12:02:00Z')), {
    event: 'release_pipeline_timing',
    sourceId: undefined,
    queueLagMs: 60000,
    sourceLagMs: 120000,
  });
  assert.equal(releasePipelineTiming({ ...entry, seenAt: 'invalid' }), null);
  assert.deepEqual(timingSummary([100, 20, 500, NaN, -2]), {
    samples: 3,
    p50Ms: 100,
    p95Ms: 500,
    maxMs: 500,
  });
});

test('worker budgets and concurrent revisions are deferred without provider failures or whole-job retries', async () => {
  const { sourceWorkSummary } = await import('../lib/source-work');
  assert.deepEqual(
    sourceWorkSummary([
      { outcome: 'budget_exhausted' },
      {
        outcome: 'source_unavailable',
        diagnostic: { stage: 'publication', category: 'version_conflict', durationMs: 1 },
      },
    ]),
    { sourceFailures: 0, operationalFailures: 0, checked: 0 },
  );
  assert.deepEqual(
    sourceWorkSummary([
      {
        outcome: 'source_unavailable',
        diagnostic: { stage: 'publication', category: 'database_unavailable', durationMs: 1 },
      },
      { outcome: 'matched', partial: true },
    ]),
    { sourceFailures: 1, operationalFailures: 1, checked: 1 },
  );
});

test('detail polling backs off within the background lease budget instead of sending a rapid request stream', async () => {
  const { DETAIL_POLL_LIMIT, detailPollDelay } = await import('../lib/foreground');
  assert.equal(detailPollDelay(0), 1500);
  assert.equal(detailPollDelay(8), 5000);
  assert.ok(DETAIL_POLL_LIMIT < 20);
  assert.ok(
    Array.from({ length: DETAIL_POLL_LIMIT }, (_, i) => detailPollDelay(i)).reduce(
      (a, b) => a + b,
      0,
    ) >= 38000,
  );
});
