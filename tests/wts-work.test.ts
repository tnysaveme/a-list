import test from 'node:test';
import assert from 'node:assert/strict';
import { wtsWorkLimit } from '../lib/wts-work';
import { sourceHealthSummary } from '../lib/source-health';
const now = Date.parse('2026-11-13T12:00:00Z');
const stamp = (minutes: number) => new Date(now - minutes * 60000).toISOString();
const healthy = {
  last_success_at: stamp(0),
  catalogue_success_at: stamp(0),
  source_health: { wts_feed: { ok: true, lastSuccess: stamp(0) } },
  wts_profile_changes: { checkedAt: stamp(0), through: stamp(0) },
  wts_coverage: { checkedAt: stamp(0), unexplained: 0 },
  wts_profile_indexed_at: stamp(0),
  queues: {
    profiles: { due: 0 },
    announcements: { due: 0 },
    saved: { due: 0 },
    lookups: { due: 0 },
  },
};
test('readiness detects stalled publication, missing health, recovery scans and coverage audits despite successful discovery', () => {
  assert.equal(sourceHealthSummary(healthy, now).status, 'healthy');
  assert.deepEqual(
    sourceHealthSummary(
      {
        ...healthy,
        wts_coverage: { checkedAt: stamp(91), unexplained: 1 },
        wts_profile_indexed_at: stamp(721),
        queues: {
          ...healthy.queues,
          profiles: { due: 12, oldestDueAt: stamp(61) },
          announcements: { due: 1, oldestDueAt: stamp(61) },
        },
      },
      now,
    ).issues,
    [
      'wts_audit_stale',
      'wts_coverage_gaps',
      'wts_recovery_scan_stale',
      'profiles_queue_stalled',
      'announcements_queue_stalled',
    ],
  );
  assert.ok(
    sourceHealthSummary({ ...healthy, queues: undefined }, now).issues.includes(
      'profiles_queue_stalled',
    ),
  );
  assert.equal(
    sourceHealthSummary(
      { ...healthy, queues: { ...healthy.queues, profiles: { due: 1, oldestDueAt: stamp(60) } } },
      now,
    ).status,
    'healthy',
  );
});
test('catch-up responds to queue size and age, retaining normal limits when current', () => {
  assert.equal(wtsWorkLimit(healthy.queues, now), 5);
  assert.equal(wtsWorkLimit({ profiles: { due: 4 }, announcements: { due: 4 } }, now), 16);
  assert.equal(wtsWorkLimit({ profiles: { due: 8, oldestDueAt: stamp(0) } }, now), 16);
  assert.equal(wtsWorkLimit({ announcements: { due: 1, oldestDueAt: stamp(31) } }, now), 16);
  assert.equal(wtsWorkLimit({ announcements: { due: 0, oldestDueAt: stamp(90) } }, now), 5);
});
