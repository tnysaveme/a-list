import test from 'node:test';
import assert from 'node:assert/strict';
import { applyWatchedBatch } from '../lib/watched-library';
import { CatalogueMemory } from '../lib/catalogue-memory';
import { libraryInput } from '../lib/api-validation';
import type { Movie } from '../lib/model';

const stamp = '2026-11-04T12:00:00.000Z';
test('absent or concurrently removed films cannot be reported as saved by an unwatch', async () => {
  let writes = 0;
  const absent = await applyWatchedBatch(false, ['1'], {
    read: async () => ({ membership: { '1': false }, watched: { '1': null } }),
    write: async () => {
      writes++;
      return { membership: { '1': false }, watched: { '1': null } };
    },
  });
  assert.equal(writes, 0);
  assert.deepEqual(absent.completedIds, []);
  assert.deepEqual(absent.watched, {});
  let reads = 0;
  const removed = await applyWatchedBatch(false, ['1'], {
    read: async () =>
      ++reads === 1
        ? { membership: { '1': true }, watched: { '1': stamp } }
        : { membership: { '1': false }, watched: { '1': null } },
    write: async () => ({ membership: { '1': false }, watched: { '1': null } }),
  });
  assert.deepEqual(removed.completedIds, []);
  assert.deepEqual(removed.remainingIds, ['1']);
  assert.deepEqual(removed.watched, {});
});
test('watched changes reconcile a lost response and remain idempotent', async () => {
  let watchedAt: string | null = null,
    writes = 0;
  const io = {
    read: async () => ({ membership: { '1': true }, watched: { '1': watchedAt } }),
    write: async () => {
      watchedAt = stamp;
      writes++;
      throw Error('response lost');
    },
  };
  const result = await applyWatchedBatch(true, ['1'], io);
  assert.deepEqual(result.changedIds, ['1']);
  assert.equal(result.watched['1'], stamp);
  assert.deepEqual((await applyWatchedBatch(true, ['1'], io)).changedIds, []);
  assert.equal(writes, 1);
});
test('failed and unconfirmed watch writes never claim success or invent a timestamp', async () => {
  const failed = await applyWatchedBatch(true, ['1'], {
    read: async () => ({ membership: { '1': true }, watched: { '1': null } }),
    write: async () => {
      throw Error('unavailable');
    },
  });
  assert.deepEqual(failed.remainingIds, ['1']);
  assert.deepEqual(failed.watched, {});
  let reads = 0;
  const acknowledged = await applyWatchedBatch(true, ['1'], {
    read: async () => {
      if (reads++) throw Error('unavailable');
      return { membership: { '1': true }, watched: { '1': null } };
    },
    write: async () => ({ watched: { '1': stamp }, membership: { '1': true } }),
  });
  assert.equal(acknowledged.watched['1'], stamp);
  assert.equal(acknowledged.reconciled, false);
});
test('moving back to To Watch clears the date and shared fallback retains personal state', async () => {
  const result = await applyWatchedBatch(false, ['1'], {
    read: (() => {
      let reads = 0;
      return async () => ({ membership: { '1': true }, watched: { '1': reads++ ? null : stamp } });
    })(),
    write: async () => ({ watched: { '1': null }, membership: { '1': true } }),
  });
  assert.deepEqual(result.watched, { '1': null });
  const movie = {
    id: '1',
    title: 'Film',
    year: '2026',
    poster: '',
    source: '',
    checkedAt: stamp,
    releases: [],
    saved: true,
  } as Movie;
  const memory = new CatalogueMemory([movie]);
  const epoch = memory.epoch;
  memory.recordWatched({ '1': stamp });
  memory.remember([movie], epoch === memory.epoch);
  assert.equal(memory.fallback([movie])[0].watchedAt, stamp);
  assert.equal(memory.fallback([movie])[0].tracked, false);
  memory.recordWatched({ '1': null });
  assert.equal(memory.fallback([movie])[0].tracked, true);
});
test('watched restoration is bounded to the requested films and valid timestamps', () => {
  assert.equal(libraryInput({ action: 'watch', ids: ['1'] }).action, 'watch');
  assert.equal(
    libraryInput({ action: 'add', ids: ['1'], watchedAt: { '1': stamp } }).watchedAt?.['1'],
    stamp,
  );
  for (const body of [
    { action: 'add', ids: ['1'], watchedAt: { '2': stamp } },
    { action: 'add', ids: ['1'], watchedAt: { '1': 'not a date' } },
    { action: 'watch', ids: ['1'], watchedAt: { '1': stamp } },
  ])
    assert.throws(() => libraryInput(body));
});
