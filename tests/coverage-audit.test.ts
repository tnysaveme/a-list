import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { auditCoverageWhenDue, coverageAuditDue } from '../lib/coverage-audit';

const start = Date.parse('2026-10-30T12:00:00Z');
test('coverage audits become due at one hour and recover from unusable checkpoints', () => {
  const checkpoint = { checkedAt: new Date(start).toISOString() };
  for (const age of [0, 600_000, 3599_999])
    assert.equal(coverageAuditDue(checkpoint, start + age), false);
  for (const age of [3600_000, 4200_000, 86400_000])
    assert.equal(coverageAuditDue(checkpoint, start + age), true);
  for (const invalid of [
    null,
    undefined,
    {},
    'invalid',
    { checkedAt: 123 },
    { checkedAt: 'invalid' },
    { checkedAt: new Date(start + 1).toISOString() },
  ])
    assert.equal(coverageAuditDue(invalid, start), true);
});

test('ten-minute worker passes skip recent audits, retry failures and resume hourly after success', async () => {
  let clock = start,
    calls = 0,
    fail = false;
  let persisted: { checkedAt: string; queued: number } | null = null;
  const db = createClient('https://database.example.invalid', 'fixture-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        calls++;
        assert.equal(new URL(String(input)).pathname, '/rest/v1/rpc/a_list_reconcile_wts_coverage');
        assert.deepEqual(JSON.parse(String(init?.body)), { p_limit: 16 });
        if (fail) return Response.json({ message: 'Audit transaction failed' }, { status: 500 });
        persisted = { checkedAt: new Date(clock).toISOString(), queued: 2 };
        return Response.json(persisted);
      },
    },
  });
  const run = () => auditCoverageWhenDue(db, persisted, AbortSignal.timeout(1000), clock);
  assert.deepEqual(await run(), { checkedAt: new Date(start).toISOString(), queued: 2 });
  for (let minute = 10; minute < 60; minute += 10) {
    clock = start + minute * 60_000;
    assert.equal(await run(), null);
  }
  assert.equal(calls, 1, 'skipped audits make no database request');
  clock = start + 3600_000;
  fail = true;
  await assert.rejects(run(), /Audit transaction failed/);
  const checkpointBeforeRetry = persisted;
  clock += 600_000;
  fail = false;
  assert.notDeepEqual(await run(), checkpointBeforeRetry);
  assert.equal(calls, 3, 'failure is retried on the next ten-minute pass');
  clock += 600_000;
  assert.equal(await run(), null);
  assert.equal(calls, 3);
});
