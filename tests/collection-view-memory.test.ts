import test from 'node:test';
import assert from 'node:assert/strict';
import { CollectionViewMemory } from '../lib/collection-view-memory';

const query = { filter: 'all', sort: 'release' };
test('view memory retains appended pages and expires on time, day, or invalidation', () => {
  const views = new CollectionViewMemory<{ movies: { id: string }[]; total: number }>();
  const value = { movies: Array.from({ length: 51 }, (_, i) => ({ id: String(i) })), total: 100 };
  views.remember(query, value, '2026-11-04', 75, 0);
  assert.equal(views.read(query, '2026-11-04', 100)?.value.movies.length, 51);
  assert.equal(views.read(query, '2026-11-04', 100)?.extent, 75);
  assert.equal(views.read(query, '2026-11-04', 60000), null);
  views.remember(query, value, '2026-11-04', 75, 0);
  assert.equal(views.read(query, '2026-11-05', 100), null);
  views.remember(query, value, '2026-11-04', 75, 0);
  views.clear();
  assert.equal(views.read(query, '2026-11-04', 100), null);
});
test('view memory is bounded and does not retain very large rendered ranges', () => {
  const views = new CollectionViewMemory<{ movies: string[] }>();
  for (let i = 0; i < 7; i++)
    views.remember({ sort: String(i), filter: 'all' }, { movies: [] }, 'day', 25, 0);
  assert.equal(views.read({ sort: '0', filter: 'all' }, 'day', 100), null);
  assert.ok(views.read({ sort: '6', filter: 'all' }, 'day', 100));
  views.remember(query, { movies: ['film'] }, 'day', 25, 0);
  views.remember(query, { movies: Array(251).fill('film') }, 'day', 275, 0);
  assert.equal(views.read(query, 'day', 100), null);
});
