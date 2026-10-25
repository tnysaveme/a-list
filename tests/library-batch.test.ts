import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLibraryBatch, type Membership } from '../lib/library-batch';
const ids = Array.from({ length: 125 }, (_, i) => String(i + 1));
const membership = (saved: Set<string>, items: string[]): Membership =>
  Object.fromEntries(items.map((id) => [id, saved.has(id)]));
test('a second-chunk failure reconciles the first 100 removals and limits Undo to those films', async () => {
  const saved = new Set(ids);
  let writes = 0,
    reads = 0;
  const result = await applyLibraryBatch('remove', ids, {
    read: async (list) => {
      reads++;
      return membership(saved, list);
    },
    write: async (_action, list) => {
      if (++writes === 2) throw new Error('Network failure');
      list.forEach((id) => saved.delete(id));
    },
  });
  assert.equal(result.changedIds.length, 100);
  assert.deepEqual(result.remainingIds, ids.slice(100));
  assert.equal(result.reconciled, true);
  assert.equal(reads, 4);
  const restored = await applyLibraryBatch('add', result.changedIds, {
    read: async (list) => membership(saved, list),
    write: async (_action, list) => {
      list.forEach((id) => saved.add(id));
    },
  });
  assert.equal(restored.remainingIds.length, 0);
  assert.equal(saved.size, 125);
});
test('a committed write with a lost response is discovered before offering retry or Undo', async () => {
  const saved = new Set(ids);
  let writes = 0;
  const result = await applyLibraryBatch('remove', ids, {
    read: async (list) => membership(saved, list),
    write: async (_action, list) => {
      list.forEach((id) => saved.delete(id));
      if (++writes === 2) throw new Error('Lost response');
    },
  });
  assert.equal(result.changedIds.length, 125);
  assert.equal(result.remainingIds.length, 0);
  assert.equal(result.error, undefined);
});
test('unconfirmed final reads offer Undo only for acknowledged writes', async () => {
  const saved = new Set(ids);
  let reads = 0,
    writes = 0;
  const result = await applyLibraryBatch('remove', ids, {
    read: async (list) => {
      if (++reads > 2) throw new Error('Read unavailable');
      return membership(saved, list);
    },
    write: async (_action, list) => {
      list.forEach((id) => saved.delete(id));
      if (++writes === 2) throw new Error('Lost response');
    },
  });
  assert.equal(result.reconciled, false);
  assert.equal(result.changedIds.length, 100);
  assert.equal(result.remainingIds.length, 25);
  assert.match(result.error!, /could not be confirmed/);
});
test('missing initial membership aborts before writes, and already-saved films are not counted as new additions', async () => {
  let writes = 0;
  const broken = await applyLibraryBatch('remove', ['1'], {
    read: async () => ({}),
    write: async () => {
      writes++;
    },
  });
  assert.equal(writes, 0);
  assert.match(broken.error!, /No changes were requested/);
  const saved = new Set(['1']);
  const result = await applyLibraryBatch('add', ['1', '2', '2'], {
    read: async (list) => membership(saved, list),
    write: async (_action, list) => {
      list.forEach((id) => saved.add(id));
    },
  });
  assert.deepEqual(result.changedIds, ['2']);
  assert.deepEqual(result.completedIds, ['1', '2']);
});
