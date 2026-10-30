import test from 'node:test';
import assert from 'node:assert/strict';
import { sharedSearch } from '../lib/shared-search';
import { versionedCache } from '../lib/versioned-cache';

test('simultaneous searches share one provider call, including an empty result', async () => {
  let loads = 0;
  const options = {
    read: async () => null,
    lease: async (work: () => Promise<string[]>) => work(),
    load: async () => {
      loads++;
      return [];
    },
  };
  const results = await Promise.all(
    Array.from({ length: 12 }, () => sharedSearch('same', options)),
  );
  assert.deepEqual(
    results,
    Array.from({ length: 12 }, () => []),
  );
  assert.equal(loads, 1);
});

test('a search on another instance waits for its cached result without calling providers', async () => {
  let time = 0,
    reads = 0;
  const result = await sharedSearch('remote', {
    read: async () => {
      reads++;
      return time >= 300 ? ['shared film'] : null;
    },
    lease: async () => null,
    load: async () => {
      throw Error('Duplicate provider work');
    },
    now: () => time,
    sleep: async (ms) => {
      time += ms;
    },
  });
  assert.deepEqual(result, ['shared film']);
  assert.equal(reads, 3);
});

test('search waiting is bounded and failures do not poison subsequent attempts', async () => {
  let time = 0,
    reads = 0;
  await assert.rejects(
    sharedSearch('retry', {
      read: async () => {
        reads++;
        return null;
      },
      lease: async () => null,
      load: async () => {
        throw Error('Duplicate provider work');
      },
      now: () => time,
      sleep: async (ms) => {
        time += ms;
      },
    }),
    /still refreshing/,
  );
  assert.equal(time, 3000);
  assert.ok(reads < 12);
  assert.deepEqual(
    await sharedSearch('retry', {
      read: async () => ['recovered'],
      lease: async () => null,
      load: async () => [],
    }),
    ['recovered'],
  );
  await assert.rejects(
    sharedSearch('provider-failure', {
      read: async () => null,
      lease: async (work) => work(),
      load: async () => {
        throw Error('Provider unavailable');
      },
    }),
    /Provider unavailable/,
  );
});

test('versioned cache reuses a stable snapshot and immediately stops using revoked mappings', async () => {
  let version = 'approved',
    loads = 0;
  const values = new Map<string, string[]>();
  const store = {
    version: async () => version,
    read: async (key: string) => values.get(key) ?? null,
    load: async () => {
      loads++;
      return version === 'approved' ? ['mapping'] : [];
    },
    write: async (key: string, value: string[]) => {
      values.set(key, value);
    },
  };
  assert.deepEqual(await versionedCache('identity', store), ['mapping']);
  assert.deepEqual(await versionedCache('identity', store), ['mapping']);
  assert.equal(loads, 1);
  version = 'revoked';
  assert.deepEqual(await versionedCache('identity', store), []);
  assert.equal(loads, 2);
});

test('a mapping change during pagination discards the mixed snapshot before caching', async () => {
  let version = 'before',
    loads = 0;
  const writes: string[] = [];
  const result = await versionedCache('racing-identity', {
    version: async () => version,
    read: async () => null,
    load: async () => {
      loads++;
      version = 'after';
      return loads === 1 ? ['stale'] : ['current'];
    },
    write: async (key, value) => {
      writes.push(key + ':' + value.join());
    },
  });
  assert.deepEqual(result, ['current']);
  assert.deepEqual(writes, ['racing-identity:after:current']);
  assert.equal(loads, 2);
});
