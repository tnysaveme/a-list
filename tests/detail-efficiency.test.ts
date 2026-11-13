import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import type { Movie } from '../lib/model';
import { rememberDetail, rememberedDetail, type DetailMemory } from '../lib/detail-memory';
const afters: (() => Promise<void>)[] = [];
Object.assign(globalThis, { __afterlightDetailAfters: afters });
registerHooks({
  resolve(s, c, n) {
    if (s === 'next/server')
      return {
        url: 'data:text/javascript,export function after(work){globalThis.__afterlightDetailAfters.push(work)}',
        shortCircuit: true,
      };
    return s === 'server-only'
      ? {
          url: new URL('../node_modules/next/dist/compiled/server-only/empty.js', import.meta.url)
            .href,
          shortCircuit: true,
        }
      : n(s, c);
  },
});
const { getMovie } = await import('../lib/data');
const { detailRefreshDue } = await import('../lib/detail-refresh');
const movie: Movie = {
  id: 'tt7777777',
  imdbId: 'tt7777777',
  title: 'A Film',
  year: '2026',
  source: 'https://www.imdb.com/title/tt7777777/',
  poster: '',
  checkedAt: '2000-01-01T00:00:00Z',
  releases: [],
};
test('stored detail reads do not start or wait for upstream work before the response', async () => {
  const original = globalThis.fetch;
  let upstream = 0;
  const requests: string[] = [];
  try {
    globalThis.fetch = async () => {
      upstream++;
      throw Error('No source request belongs on this path');
    };
    const db = createClient('https://database.example.invalid', 'fixture-key', {
      auth: { persistSession: false },
      global: {
        fetch: async (input) => {
          const url = new URL(String(input));
          requests.push(url.pathname);
          return Response.json(
            url.pathname.endsWith('a_list_movies')
              ? {
                  movie,
                  refresh_after: '2000-01-01T00:00:00Z',
                  report_lookup_after: '2000-01-01T00:00:00Z',
                }
              : [],
          );
        },
      },
    });
    const result = await getMovie({ db, userId: 'owner' }, movie.id);
    assert.equal(result?.title, movie.title);
    assert.equal(result?.refreshPending, true);
    assert.equal(upstream, 0);
    assert.equal(afters.length, 1);
    assert.equal(requests.length, 2);
  } finally {
    globalThis.fetch = original;
    afters.length = 0;
  }
});
test('fresh details and retry schedules suppress unnecessary background work', () => {
  const now = Date.now();
  const fresh = {
    ...movie,
    overview: 'Saved synopsis',
    synopsisCheckedAt: new Date(now).toISOString(),
    releaseCheckedAt: new Date(now).toISOString(),
  };
  assert.equal(
    detailRefreshDue(
      {
        movie: fresh,
        refresh_after: new Date(now + 3600000).toISOString(),
        report_lookup_after: new Date(now + 3600000).toISOString(),
      },
      now,
    ),
    false,
  );
  assert.equal(detailRefreshDue({ movie: { ...fresh, mediaType: 'series' } }, now), false);
});
test('detail memory is bounded, ignores personal-state changes and invalidates changed releases and age', () => {
  const memory: DetailMemory = new Map();
  rememberDetail(memory, movie, 1000);
  assert.ok(rememberedDetail(memory, { ...movie, saved: true, watchedAt: '2026-11-13' }, 2000));
  assert.equal(rememberedDetail(memory, movie, 61001), null);
  assert.equal(
    rememberedDetail(
      memory,
      {
        ...movie,
        releases: [
          {
            kind: 'Digital',
            date: '2099-11-01',
            confidence: 'listed',
            source: movie.source,
            sourceName: 'A Source',
          },
        ],
      },
      2000,
    ),
    null,
  );
  for (let i = 0; i < 60; i++) rememberDetail(memory, { ...movie, id: String(i) }, 2000);
  assert.equal(memory.size, 50);
  rememberDetail(memory, { ...movie, refreshPending: true }, 3000);
  assert.equal(memory.has(movie.id), false);
});
