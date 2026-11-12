import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshLoadedPages } from '../lib/collection-pages';

test('refreshes three loaded pages in order and retains the server next offset', async () => {
  const offsets: number[] = [];
  const result = await refreshLoadedPages(async (offset) => {
    offsets.push(offset);
    return {
      movies: Array.from({ length: 25 }, (_, i) => ({ id: String(offset + i) })),
      nextOffset: offset + 25,
      total: 100,
    };
  }, 75);
  assert.deepEqual(offsets, [0, 25, 50]);
  assert.equal(result.movies.length, 75);
  assert.equal(result.nextOffset, 75);
});

test('a real shrink stops at the new end; overlapping pages never duplicate a film', async () => {
  const result = await refreshLoadedPages(
    async (offset) =>
      offset === 0
        ? {
            movies: [
              { id: 'a', title: 'fresh' },
              { id: 'b', title: 'B' },
            ],
            nextOffset: 25,
          }
        : {
            movies: [
              { id: 'a', title: 'duplicate' },
              { id: 'c', title: 'C' },
            ],
            nextOffset: null,
          },
    75,
  );
  assert.deepEqual(
    result.movies.map((film) => film.id),
    ['a', 'b', 'c'],
  );
  assert.equal(result.movies[0].title, 'fresh');
  assert.equal(result.nextOffset, null);
});

test('partial failure rejects the range; invalid offsets cannot produce a refresh loop', async () => {
  await assert.rejects(
    refreshLoadedPages(async (offset) => {
      if (offset) throw new Error('second page unavailable');
      return { movies: [{ id: 'a' }], nextOffset: 25 };
    }, 50),
    /second page unavailable/,
  );
  await assert.rejects(
    refreshLoadedPages(async () => ({ movies: [{ id: 'a' }], nextOffset: 0 }), 50),
    /invalid next page/,
  );
});
