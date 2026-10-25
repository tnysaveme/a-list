import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshGate } from '../lib/refresh-gate';

test('focus, visibility and timer events share in-flight work and a freshness window', async () => {
  let clock = 0,
    calls = 0,
    finish = () => {};
  const refresh = refreshGate(
    () => {
      calls++;
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    },
    { now: () => clock },
  );
  await refresh();
  assert.equal(calls, 0, 'Initial view was just loaded');
  clock = 60_000;
  const focus = refresh(),
    visibility = refresh(),
    timer = refresh();
  await Promise.resolve();
  assert.equal(calls, 1);
  finish();
  await Promise.all([focus, visibility, timer]);
  clock += 1000;
  await refresh();
  assert.equal(calls, 1);
  clock += 60_000;
  const next = refresh();
  await Promise.resolve();
  assert.equal(calls, 2);
  finish();
  await next;
});

test('a failed refresh is retryable without waiting for the freshness window', async () => {
  let calls = 0;
  const refresh = refreshGate(
    async () => {
      if (++calls === 1) throw new Error('offline');
    },
    { now: () => 60_000, freshAt: 0 },
  );
  await assert.rejects(refresh(), /offline/);
  await refresh();
  assert.equal(calls, 2);
});
