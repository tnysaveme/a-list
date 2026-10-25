import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import type { Movie } from '../lib/model';
import type { LookupState } from '../lib/release-lookup';
registerHooks({
  resolve(s, c, n) {
    return s === 'server-only'
      ? {
          url: new URL('../node_modules/next/dist/compiled/server-only/empty.js', import.meta.url)
            .href,
          shortCircuit: true,
        }
      : n(s, c);
  },
});
const { lookupReleaseReports, refreshReportLookups } = await import('../lib/release-lookup');
const movie: Movie = {
  id: 'tt29512008',
  imdbId: 'tt29512008',
  title: 'Filipiñana',
  year: '2026',
  source: 'https://www.imdb.com/title/tt29512008/',
  poster: '',
  checkedAt: '2026-10-25T00:00:00Z',
  releases: [],
};
const db = {} as NonNullable<Parameters<typeof lookupReleaseReports>[1]>['db'];
const empty = '<rss><channel>' + '.'.repeat(600) + '</channel></rss>';
function cache() {
  const values = new Map<string, LookupState>(),
    writes: number[] = [];
  return {
    values,
    writes,
    api: {
      async read(key: string) {
        return values.get(key) || null;
      },
      async write(key: string, value: LookupState, ttl: number) {
        values.set(key, value);
        writes.push(ttl);
      },
      async lease<T>(_key: string, _ttl: number, work: () => Promise<T>) {
        return work();
      },
    },
  };
}
test('daily title lookups cache empty results, skip complete windows, and retain short failure retries', async () => {
  const original = globalThis.fetch,
    fake = cache();
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return new Response(empty);
  };
  try {
    assert.equal(
      (await lookupReleaseReports(movie, { db, lookupCache: fake.api })).attempted,
      true,
    );
    assert.equal(
      (await lookupReleaseReports(movie, { db, lookupCache: fake.api })).attempted,
      false,
    );
    assert.equal(requests, 1);
    assert.deepEqual(fake.writes, [86400]);
    const complete = {
      ...movie,
      releases: [
        {
          kind: 'Digital' as const,
          date: '2026-10-27',
          confidence: 'listed' as const,
          source: 'https://example.com',
          sourceName: 'Test',
        },
        {
          kind: 'Subscription' as const,
          date: '2026-11-01',
          confidence: 'listed' as const,
          source: 'https://example.com',
          sourceName: 'Test',
        },
      ],
    };
    assert.equal(
      (await lookupReleaseReports(complete, { db, lookupCache: cache().api })).outcome,
      'ineligible',
    );
    assert.equal(requests, 1);
    globalThis.fetch = async () => new Response('Unavailable', { status: 503 });
    const failed = cache();
    const result = await lookupReleaseReports(movie, { db, lookupCache: failed.api });
    assert.equal(result.movie, movie);
    assert.equal(result.outcome, 'source_unavailable');
    assert.deepEqual(failed.writes, [600]);
  } finally {
    globalThis.fetch = original;
  }
});
test('already-dated films look for missing streaming windows and prefer them over repeated rental reports', async () => {
  const original = globalThis.fetch,
    fake = cache(),
    rental = {
      kind: 'Digital' as const,
      date: '2026-10-27',
      confidence: 'listed' as const,
      source: 'https://example.com',
      sourceName: 'Test',
    },
    dated = { ...movie, releases: [rental] };
  const fresh = {
    ...dated,
    releases: [
      rental,
      { ...rental, kind: 'Subscription' as const, platform: 'Netflix', date: '2026-11-03' },
    ],
  };
  globalThis.fetch = async () =>
    new Response(
      '<rss><channel>' +
        ['Digital', 'Streaming']
          .map(
            (kind, i) =>
              `<item><title>FILIPIÑANA Gets ${kind} Release Date</title><link>https://whentostream.com/film-${i}/</link><description>${i ? 'Arriving on Netflix' : 'Digital release'} on November 3, 2026.</description></item>`,
          )
          .join('') +
        '.'.repeat(600) +
        '</channel></rss>',
    );
  const fakeDb = {
    from() {
      const q = {
        select() {
          return q;
        },
        eq() {
          return q;
        },
        abortSignal() {
          return q;
        },
        async maybeSingle() {
          return { data: { movie: fresh }, error: null };
        },
      };
      return q;
    },
  } as unknown as typeof db;
  try {
    const result = await lookupReleaseReports(dated, {
      db: fakeDb,
      lookupCache: fake.api,
      expand: async (feed, options) => {
        assert.equal(feed[0].report.release.kind, 'Subscription');
        assert.equal(options?.expectedImdbId, movie.id);
        assert.equal(options?.checkpoint, false);
        return {
          processed: 1,
          matched: 1,
          unresolved: 0,
          changed: true,
          dryRun: false,
          durationMs: 1,
          decisions: [{ source: feed[0].report.release.source, outcome: 'matched' }],
        };
      },
    });
    assert.equal(result.attempted, true);
    assert.equal(result.movie.releases[0], rental);
    assert.equal(result.movie.releases[1].platform, 'Netflix');
    assert.equal(
      (await lookupReleaseReports(dated, { db: fakeDb, lookupCache: fake.api })).attempted,
      false,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test('cached candidates advance their due time without consuming the one network-attempt slot', async () => {
  const candidates = [movie, { ...movie, id: 'tt7777777' }, { ...movie, id: 'tt8888888' }],
    updates: string[] = [],
    calls: string[] = [];
  const db = createClient('https://lookup.test', 'test', {
    auth: { persistSession: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/a_list_report_lookup_candidates'))
          return Response.json(candidates.map((m) => ({ id: m.id, movie: m })));
        if (url.pathname.includes('/rpc/')) return Response.json(null);
        updates.push(url.searchParams.get('id')!);
        assert.ok(JSON.parse(String(init?.body)).report_lookup_after);
        return new Response(null, { status: 204 });
      },
    },
  });
  const result = await refreshReportLookups({
    db,
    signal: AbortSignal.timeout(5000),
    lookup: async (m) => {
      calls.push(m.id);
      return {
        movie: m,
        attempted: m.id !== movie.id,
        outcome: m.id === movie.id ? 'cached' : 'no_report',
        nextCheckAt: new Date(Date.now() + 86400_000).toISOString(),
      };
    },
  });
  assert.deepEqual(calls, [movie.id, 'tt7777777']);
  assert.equal(updates.length, 2);
  assert.equal(result.attempts, 1);
  assert.equal(result.scanned, 2);
});

test('a completed publication can be read and cached after the source deadline, within a bounded settling window', async () => {
  const original = globalThis.fetch,
    fake = cache();
  let read = false;
  globalThis.fetch = async () =>
    new Response(
      '<rss><channel><item><title>FILIPIÑANA Gets Digital Release Date</title><link>https://whentostream.com/a-film-digital/</link><description>Digital release on November 3, 2026.</description></item>' +
        '.'.repeat(600) +
        '</channel></rss>',
    );
  const fakeDb = {
    from() {
      const q = {
        select() {
          return q;
        },
        eq() {
          return q;
        },
        abortSignal(signal: AbortSignal) {
          assert.equal(signal.aborted, false);
          read = true;
          return q;
        },
        async maybeSingle() {
          return { data: { movie }, error: null };
        },
      };
      return q;
    },
  } as unknown as typeof db;
  try {
    const result = await lookupReleaseReports(movie, {
      db: fakeDb,
      lookupCache: fake.api,
      budgetMs: 5,
      signal: AbortSignal.timeout(1000),
      expand: async () => {
        await new Promise((resolve) => setTimeout(resolve, 15));
        return {
          processed: 1,
          matched: 1,
          unresolved: 0,
          changed: true,
          dryRun: false,
          durationMs: 15,
          decisions: [{ source: 'https://whentostream.com/a-film-digital/', outcome: 'matched' }],
        };
      },
    });
    assert.equal(read, true);
    assert.equal(result.outcome, 'matched');
    assert.deepEqual(fake.writes, [86400]);
  } finally {
    globalThis.fetch = original;
  }
});
