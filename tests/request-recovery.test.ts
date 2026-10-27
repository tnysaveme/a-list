import test from 'node:test';
import assert from 'node:assert/strict';
import { runWithLease } from '../lib/lease';
import { singleFlight } from '../lib/single-flight';
import { settingsInput, libraryInput } from '../lib/api-validation';
test('lease cleanup cannot replace committed success or the original work error', async () => {
  let logged = 0;
  const store = {
    acquire: async () => true,
    release: async () => {
      throw Error('Redis unavailable');
    },
  };
  assert.equal(
    await runWithLease(
      store,
      'one',
      async () => 42,
      () => logged++,
    ),
    42,
  );
  const original = Error('write failed');
  await assert.rejects(
    runWithLease(
      store,
      'two',
      async () => {
        throw original;
      },
      () => logged++,
    ),
    (error) => error === original,
  );
  assert.equal(logged, 2);
  assert.equal(
    await runWithLease(
      { ...store, acquire: async () => false },
      'busy',
      async () => 42,
      () => {},
    ),
    null,
  );
});
test('malformed complete mutation requests are rejected before any write can be selected', () => {
  for (const ids of [['1', null], ['1', 'bad'], [], Array(101).fill('1')])
    assert.throws(() => libraryInput({ action: 'add', ids }));
  for (const value of [undefined, null, 'true', 0])
    assert.throws(() => settingsInput({ includeRumors: value }));
  assert.equal(settingsInput({ includeRumors: false }), false);
  assert.deepEqual(libraryInput({ action: 'add', ids: ['1', '1'] }), { action: 'add', ids: ['1'] });
});
test('concurrent shared rebuilds coalesce and failures do not poison retries', async () => {
  let calls = 0;
  const work = async () => {
    calls++;
    await Promise.resolve();
    return 42;
  };
  assert.deepEqual(
    await Promise.all(Array.from({ length: 20 }, () => singleFlight('fixture', work))),
    Array(20).fill(42),
  );
  assert.equal(calls, 1);
  await assert.rejects(
    singleFlight('failure', async () => {
      throw Error('temporary');
    }),
  );
  assert.equal(await singleFlight('failure', async () => 7), 7);
});

test('interactive deadlines return promptly while committed background work can finish', async () => {
  const { interactiveResult } = await import('../lib/interactive-refresh');
  let finish!: (n: number) => void;
  const work = new Promise<number>((resolve) => {
    finish = resolve;
  });
  assert.deepEqual(await interactiveResult(work, 5), { ready: false });
  finish(42);
  assert.equal(await work, 42);
  assert.deepEqual(await interactiveResult(Promise.resolve(7), 100), { ready: true, value: 7 });
});
test('configuration diagnostics contain setting names only and auth outages differ from invalid sessions', async () => {
  const { requireConfiguration, ConfigurationError } = await import('../lib/configuration');
  const { checkAuthError } = await import('../lib/auth-result');
  assert.throws(
    () => requireConfiguration('api', {}),
    (error) => error instanceof ConfigurationError && error.missing.includes('ALIST_KEY_SALT'),
  );
  checkAuthError({ status: 401 });
  checkAuthError({ name: 'AuthSessionMissingError' });
  assert.throws(() => checkAuthError({ status: 503 }), /temporarily unavailable/);
});

test('health transitions suppress repeated unchanged issues and report recovery', async () => {
  const { healthTransition } = await import('../lib/health-transition');
  const bad = { status: 'degraded' as const, issues: ['primary_failed', 'wts_feed_stale'] };
  assert.equal(healthTransition(bad, { ...bad, issues: [...bad.issues].reverse() }), null);
  assert.equal(
    healthTransition(bad, { status: 'healthy', issues: [] })?.event,
    'source_health_recovered',
  );
});

test('encrypted recovery envelopes round-trip and reject tampering or a different key', async () => {
  const { sealRecovery, openRecovery } = await import('../lib/recovery-envelope.mjs');
  const key = Buffer.alloc(32, 7),
    value = { schemaVersion: 1, private: 'fixture-calendar-token' };
  const encrypted = sealRecovery(value, key);
  assert.equal(encrypted.includes(Buffer.from(value.private)), false);
  assert.deepEqual(openRecovery(encrypted, key), value);
  assert.throws(() => openRecovery(encrypted, Buffer.alloc(32, 8)));
  encrypted[encrypted.length - 1] ^= 1;
  assert.throws(() => openRecovery(encrypted, key));
});
