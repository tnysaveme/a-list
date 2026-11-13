import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { profileFingerprint, type SourceProfile } from '../lib/release-profile';
import {
  mergeReleaseFeed,
  cachedIdentity,
  SIX_HOURS,
  type MatchRow,
  type FeedEntry,
} from '../lib/release-automation';
import type { Movie } from '../lib/model';
import { makeCalendar } from '../lib/calendar';
import type { adminDb } from '../lib/supabase/admin';
registerHooks({
  resolve(specifier, context, next) {
    return specifier === 'server-only'
      ? {
          url: new URL('../node_modules/next/dist/compiled/server-only/empty.js', import.meta.url)
            .href,
          shortCircuit: true,
        }
      : next(specifier, context);
  },
});
const { expandReleases } = await import('../lib/release-expansion');
const { lookupReleaseReports } = await import('../lib/release-lookup');
const { refreshMovie } = await import('../lib/movie-refresh');
const { inferredIdentity } = await import('../lib/release-automation');
const { parseProfileReports, parseVerifiedReport, profileReleaseEvidence, text } =
  await import('../lib/sources');
const { profileReference } = await import('../lib/reviewed-report-identities');
const padding = '<!--' + '.'.repeat(600) + '-->';
const now = new Date().toISOString(),
  profileTime = new Date(Date.now() - 3600_000).toISOString();
function film(index: number) {
  const profile: SourceProfile = {
    sourceFilmId: String(8000 + index),
    sourceFilmUrl: `https://whentostream.com/film-${index}-2026/`,
    title: `Film ${index}`,
    year: '2026',
    directors: ['A Director'],
    cast: ['First Actor', 'Second Actor'],
    overview: 'A family searches for an island.',
  };
  const movie: Movie = {
    id: `tt${7000000 + index}`,
    imdbId: `tt${7000000 + index}`,
    title: profile.title,
    year: '2026',
    source: `https://www.imdb.com/title/tt${7000000 + index}/`,
    poster: '',
    checkedAt: now,
    releases: [],
  };
  const row: MatchRow = {
    source_id: profile.sourceFilmId,
    profile,
    fingerprint: profileFingerprint(profile),
    reviewed_fingerprint: profileFingerprint(profile),
    status: 'approved',
    approved_imdb_id: movie.id,
    movie_id: movie.id,
    reviewed_at: now,
    checked_at: now,
    profile_checked_at: profileTime,
    match_method: 'reviewed',
    rule_version: 0,
    reports: [],
    suggestions: [],
    rationale: 'Previously reviewed identity',
  };
  const report = {
    title: profile.title,
    release: {
      source: `https://whentostream.com/film-${index}-streaming/`,
      sourceName: 'When To Stream',
      kind: 'Subscription' as const,
      platform: 'Netflix',
      date: '2026-11-11',
      confidence: 'listed' as const,
    },
  };
  const entry = mergeReleaseFeed([], [report], now)[0];
  const article = `<div itemprop="articleBody"><p><a href="${profile.sourceFilmUrl}" data-type="page" data-id="${profile.sourceFilmId}">${profile.title}</a> is arriving on Netflix on November 11, 2026.</p></div>${padding}`;
  const page = `<link rel="canonical" href="${profile.sourceFilmUrl}"><article id="post-${profile.sourceFilmId}"><h1>${profile.title} (2026)</h1><p>Director: A Director</p><p>Cast: First Actor, Second Actor</p><p>Synopsis: ${profile.overview}</p></article>${padding}`;
  return { profile, movie, row, entry, article, page };
}
function store(seed: ReturnType<typeof film>[]) {
  const rows = new Map(seed.map((f) => [f.row.source_id, f.row])),
    movies = new Map(
      seed.map((f) => [f.movie.id, { id: f.movie.id, movie: f.movie, updated_at: now }]),
    );
  const writes: { name: string; args: Record<string, unknown> }[] = [],
    state = { feed: [] as FeedEntry[] };
  const db = {
    from(table: string) {
      const filters = new Map<string, unknown>();
      let expression = '',
        single = false,
        update: Record<string, unknown> | undefined;
      const query = {
        select() {
          return query;
        },
        eq(key: string, value: unknown) {
          filters.set(key, value);
          return query;
        },
        or(value: string) {
          expression = value;
          return query;
        },
        limit() {
          return query;
        },
        abortSignal() {
          return query;
        },
        maybeSingle() {
          single = true;
          return query;
        },
        update(value: Record<string, unknown>) {
          update = value;
          return query;
        },
        then(resolve: (value: { data: unknown; error: null }) => unknown) {
          let data: unknown = [];
          if (table === 'a_list_release_candidates')
            data = rows.get(String(filters.get('source_id'))) || null;
          if (table === 'a_list_movies') {
            const id = String(filters.get('id') || expression.match(/id\.eq\.(tt\d+)/)?.[1] || '');
            const found = [...movies.values()].filter(
              (row) => row.id === id || row.movie.imdbId === id,
            );
            data = single ? found[0] || null : found;
          }
          if (update?.wts_feed) state.feed = update.wts_feed as FeedEntry[];
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return query;
    },
    rpc(name: string, args: Record<string, unknown>) {
      writes.push({ name, args });
      return {
        abortSignal() {
          if (args.p_movie) {
            const movie = args.p_movie as Movie;
            movies.set(movie.id, { id: movie.id, movie, updated_at: now });
          }
          return Promise.resolve({ data: { matched: true }, error: null });
        },
      };
    },
  };
  return { db: db as unknown as ReturnType<typeof adminDb>, rows, movies, writes, state };
}
test('profile publication corroborates a cold identity and stores all explicit windows together without refetching the page', async () => {
  const fixture = film(0),
    fake = store([fixture]),
    original = globalThis.fetch;
  fake.rows.clear();
  const page = fixture.page.replace(
    '</article>',
    '<p>VOD Release Date: October 27, 2026</p><p>SVOD Release Date: expected November 11, 2026 (Netflix)</p></article>',
  );
  const reports = parseProfileReports(page, profileReference(page, fixture.movie.title, text)!);
  let metadataCalls = 0;
  globalThis.fetch = async (url) => {
    metadataCalls++;
    assert.ok(String(url).includes('cinemeta.strem.io'));
    const raw = {
      type: 'movie',
      id: fixture.movie.id,
      name: fixture.movie.title,
      releaseInfo: '2026',
      director: ['A Director'],
      cast: ['First Actor', 'Second Actor'],
      description: fixture.profile.overview,
    };
    return Response.json(String(url).includes('/catalog/') ? { metas: [raw] } : { meta: raw });
  };
  try {
    const result = await expandReleases(mergeReleaseFeed([], reports, now), {
      db: fake.db,
      sourcePages: new Map([[fixture.profile.sourceFilmUrl, page]]),
      publishUnknown: true,
      checkpoint: false,
      expectedImdbId: fixture.movie.id,
    });
    assert.equal(result.matched, 1);
    assert.equal(metadataCalls, 1);
    const stored = fake.movies.get(fixture.movie.id)!.movie;
    assert.deepEqual(
      stored.releases.map((r) => [r.kind, r.date, r.confidence]),
      [
        ['Digital', '2026-10-27', 'listed'],
        ['Subscription', '2026-11-11', 'rumored'],
      ],
    );
    assert.ok(
      stored.releases.every(
        (r) => r.filmIdentityMethod === 'corroborated' && r.filmImdbId === fixture.movie.id,
      ),
    );
    const publication = fake.writes.find((w) => w.name === 'a_list_store_release_match')!;
    assert.equal((publication.args.p_reports as unknown[]).length, 2);
    assert.deepEqual(fake.state.feed, []);
  } finally {
    globalThis.fetch = original;
  }
});
test('a newly edited profile publishes its date through incremental discovery without waiting for full catalogue or film refresh caches', async () => {
  const fixture = film(0),
    fake = store([fixture]),
    original = globalThis.fetch,
    { indexWtsProfileChanges, inventoryEntries } = await import('../lib/wts-inventory');
  const modifiedAt = new Date(Date.now() - 60_000).toISOString(),
    nativePage = fixture.page.replace(
      '</article>',
      '<p>VOD Release Date: November 12, 2026</p></article>',
    );
  let indexRequests = 0,
    profileRequests = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(init?.cache, 'no-store');
    if (url.pathname === '/wp-json/wp/v2/pages') {
      indexRequests++;
      return Response.json([
        {
          id: Number(fixture.profile.sourceFilmId),
          link: fixture.profile.sourceFilmUrl,
          title: { rendered: fixture.profile.title + ' (2026)' },
          modified_gmt: modifiedAt.replace('Z', ''),
        },
      ]);
    }
    assert.equal(url.href, fixture.profile.sourceFilmUrl);
    profileRequests++;
    return new Response(nativePage);
  };
  try {
    await indexWtsProfileChanges(
      { wts_profile_after: new Date(Date.now() + SIX_HOURS).toISOString() },
      fake.db,
      AbortSignal.timeout(5000),
    );
    const queued = fake.writes.find((write) => write.name === 'a_list_queue_wts_profiles')!;
    const entries = inventoryEntries(
      queued.args.p_profiles as Parameters<typeof inventoryEntries>[0],
    );
    const result = await expandReleases(entries, { db: fake.db, publishUnknown: true });
    assert.equal(result.matched, 1);
    assert.equal(fake.movies.get(fixture.movie.id)?.movie.releases[0]?.date, '2026-11-12');
    assert.equal(indexRequests, 1);
    assert.equal(profileRequests, 1);
    assert.equal(entries[0].revision, modifiedAt);
  } finally {
    globalThis.fetch = original;
  }
});
test('a freshly fetched native profile cannot reuse a cached identity after its credits change', async () => {
  const fixture = film(0),
    fake = store([fixture]),
    original = globalThis.fetch;
  const page = fixture.page
    .replace('Director: A Director', 'Director: Another Director')
    .replace('</article>', '<p>VOD Release Date: October 27, 2026</p></article>');
  const reports = parseProfileReports(page, profileReference(page, fixture.movie.title, text)!);
  globalThis.fetch = async (url) => {
    assert.ok(String(url).includes('cinemeta.strem.io'));
    const raw = {
      type: 'movie',
      id: fixture.movie.id,
      name: fixture.movie.title,
      releaseInfo: '2026',
      director: ['A Director'],
      cast: ['First Actor', 'Second Actor'],
      description: fixture.profile.overview,
    };
    return Response.json(String(url).includes('/catalog/') ? { metas: [raw] } : { meta: raw });
  };
  try {
    const result = await expandReleases(mergeReleaseFeed([], reports, now), {
      db: fake.db,
      sourcePages: new Map([[fixture.profile.sourceFilmUrl, page]]),
      publishUnknown: true,
      checkpoint: false,
      expectedImdbId: fixture.movie.id,
    });
    assert.equal(result.matched, 0);
    assert.equal(result.decisions[0].outcome, 'insufficient_evidence');
    assert.ok(fake.writes.every((w) => !w.args.p_movie));
    assert.deepEqual(fake.movies.get(fixture.movie.id)!.movie.releases, []);
  } finally {
    globalThis.fetch = original;
  }
});
test('Hunting Matthew Nichols and Big Baby survive provider year drift through discovery, publication and refresh', async () => {
  const original = globalThis.fetch;
  const cases = [
    {
      title: 'Hunting Matthew Nichols',
      id: 'tt29373684',
      profileYear: '2024',
      storedYear: '2024',
      searchYear: '2024',
      metadataYear: '2026',
      slug: 'hunting-matthew-nichols-2024',
      director: 'Markian Tarasiuk',
      cast: ['Miranda MacDougall', 'Markian Tarasiuk', 'Ryan Alexander McDonald'],
      fields: '<p>PVOD Release Date: TBA</p><p>SVOD Release Date: October 31, 2026 (Shudder)</p>',
      dates: ['2026-10-31'],
    },
    {
      title: 'Big Baby',
      id: 'tt32229316',
      profileYear: '2026',
      storedYear: '2025',
      searchYear: '2025',
      metadataYear: '2025',
      slug: 'big-baby-2026',
      director: 'Spider One',
      cast: ['Adam Marcinowski', 'Brandon Scott', 'Krsy Fox'],
      fields:
        '<p>VOD Release Date: August 7, 2026</p><p>SVOD Release Date: October 30, 2026 (Shudder)</p>',
      dates: ['2026-08-07', '2026-10-30'],
    },
  ];
  try {
    for (const example of cases) {
      const fixture = film(0);
      Object.assign(fixture.movie, {
        id: example.id,
        imdbId: example.id,
        title: example.title,
        year: example.storedYear,
        source: `https://www.imdb.com/title/${example.id}/`,
      });
      Object.assign(fixture.profile, {
        title: example.title,
        year: example.profileYear,
        sourceFilmUrl: `https://whentostream.com/${example.slug}/`,
        directors: [example.director],
        cast: example.cast,
      });
      const fake = store([fixture]);
      fake.rows.clear();
      const source = fixture.profile.sourceFilmUrl;
      const page = `<link rel="canonical" href="${source}"><article id="post-${fixture.profile.sourceFilmId}"><h1>${example.title} (${example.profileYear})</h1><p>Director: ${example.director}</p><p>Cast: ${example.cast.join(', ')}</p><p>Synopsis: ${fixture.profile.overview}</p>${example.fields}</article>${padding}`;
      const raw = {
        type: 'movie',
        id: example.id,
        name: example.title,
        releaseInfo: example.metadataYear,
        director: [example.director],
        cast: example.cast,
        description: fixture.profile.overview,
      };
      globalThis.fetch = async (url) => {
        const path = String(url);
        if (path.includes('/feed/'))
          return new Response(
            `<rss><channel><item><title>${example.title} (${example.profileYear})</title><link>${source}</link></item>${padding}</channel></rss>`,
          );
        if (path === source) return new Response(page);
        if (path.includes('/catalog/'))
          return Response.json({ metas: [{ ...raw, releaseInfo: example.searchYear }] });
        if (path.includes('/meta/')) return Response.json({ meta: raw });
        if (path === 'https://www.dvdsreleasedates.com/search/')
          return new Response('<p>No movies found</p>' + padding);
        throw new Error('Unexpected provider request');
      };
      const lookupCache = {
        async read() {
          return null;
        },
        async write() {},
        async lease<T>(_k: string, _t: number, work: () => Promise<T>) {
          return work();
        },
      };
      const result = await lookupReleaseReports(fixture.movie, {
        db: fake.db,
        lookupCache,
        expand: (feed, opts) => expandReleases(feed, { ...opts, publishUnknown: true }),
      });
      assert.equal(result.outcome, 'matched', example.title);
      assert.equal(result.movie.id, example.id);
      assert.equal(result.movie.year, example.storedYear);
      assert.deepEqual(
        result.movie.releases.map((r) => r.date),
        example.dates,
      );
      const mapping = inferredIdentity(
        fixture.profile,
        {
          movie: { ...fixture.movie, year: example.metadataYear },
          directors: [example.director],
          cast: example.cast,
        },
        'corroborated',
        now,
        profileFingerprint(fixture.profile),
      );
      const refreshed = await refreshMovie(result.movie, { identities: [mapping] });
      assert.deepEqual(
        refreshed.releases.map((r) => r.date),
        example.dates,
      );
      assert.ok(refreshed.releases.every((r) => r.filmImdbId === example.id));
      assert.equal(refreshed.releaseCheck?.status, 'fresh');
    }
  } finally {
    globalThis.fetch = original;
  }
});
test('warm automatic processing is bounded to five films/two concurrent checks, performs no metadata searches, and repeat runs do no work', async () => {
  const fixtures = Array.from({ length: 8 }, (_, index) => film(index)),
    fake = store(fixtures),
    original = globalThis.fetch;
  let active = 0,
    peak = 0,
    requests = 0;
  globalThis.fetch = async (url) => {
    requests++;
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    const found = fixtures.find(
      (f) =>
        f.entry.report.release.source === String(url) || f.profile.sourceFilmUrl === String(url),
    );
    assert.ok(found, 'Known mappings recheck their native profile without metadata searches');
    return new Response(
      String(url) === found.profile.sourceFilmUrl
        ? found.page.replace(
            '</article>',
            '<p>SVOD Release Date: November 12, 2026 (Netflix)</p></article>',
          )
        : found.article,
    );
  };
  try {
    const first = await expandReleases(
      fixtures.map((f) => f.entry),
      { db: fake.db, publishUnknown: true },
    );
    assert.equal(first.matched, 5);
    assert.equal(requests, 10);
    assert.ok(peak <= 2);
    assert.equal(fake.writes.length, 5);
    for (const write of fake.writes)
      assert.ok(
        Date.parse((write.args.p_match as { profile_checked_at: string }).profile_checked_at) >=
          Date.parse(now),
      );
    for (const write of fake.writes)
      assert.equal(
        (write.args.p_movie as Movie).releases.find((r) => r.kind === 'Subscription')?.date,
        '2026-11-12',
        'Current profile dates override an older announcement',
      );
    const repeated = await expandReleases(fake.state.feed.slice(0, 5), {
      db: fake.db,
      publishUnknown: true,
    });
    assert.equal(repeated.processed, 0);
    assert.equal(requests, 10);
    const shadow = await expandReleases([fixtures[0].entry], { db: fake.db, dryRun: true });
    assert.equal(shadow.matched, 1);
    assert.equal(fake.writes.length, 5);
  } finally {
    globalThis.fetch = original;
  }
});
test('cold matching imports one corroborated identity, defers ambiguity and failed metadata, and honours the pause switch', async () => {
  const fixture = film(0),
    original = globalThis.fetch;
  async function run(mode: 'unique' | 'ambiguous' | 'failed' | 'paused') {
    const fake = store([]);
    let metadataCalls = 0;
    globalThis.fetch = async (url) => {
      const path = String(url);
      if (path === fixture.entry.report.release.source) return new Response(fixture.article);
      if (path === fixture.profile.sourceFilmUrl) return new Response(fixture.page);
      if (path.includes('/catalog/')) {
        metadataCalls++;
        return Response.json({
          metas: [0, 1].map((index) => ({
            id: `tt${7000000 + index}`,
            type: 'movie',
            name: 'Film 0',
            year: '2026',
          })),
        });
      }
      if (path.includes('/meta/')) {
        metadataCalls++;
        if (mode === 'failed' && path.includes('7000001'))
          return new Response('Unavailable', { status: 503 });
        return Response.json({
          meta: {
            id: path.includes('7000001') ? 'tt7000001' : 'tt7000000',
            type: 'movie',
            name: 'Film 0',
            year: '2026',
            director:
              path.includes('7000001') && mode === 'unique' ? ['Another Director'] : ['A Director'],
            cast: ['First Actor', 'Second Actor'],
            description: 'A family searches for an island.',
          },
        });
      }
      if (path === 'https://www.dvdsreleasedates.com/search/')
        return new Response('<div>No results found</div>' + padding);
      throw Error('Unexpected upstream request');
    };
    const result = await expandReleases([fixture.entry], {
      db: fake.db,
      publishUnknown: mode !== 'paused',
    });
    return { result, fake, metadataCalls };
  }
  try {
    const unique = await run('unique');
    assert.equal(unique.result.matched, 1);
    assert.equal(unique.result.decisions[0].method, 'corroborated');
    assert.equal(unique.fake.writes.length, 1);
    assert.equal(unique.metadataCalls, 3);
    for (const mode of ['ambiguous', 'failed', 'paused'] as const) {
      const result = await run(mode);
      assert.equal(result.result.matched, 0);
      assert.equal(result.fake.writes.length, 0);
      assert.ok(Date.parse(result.fake.state.feed[0].nextCheckAt!) > Date.now());
      if (mode === 'paused') assert.equal(result.metadataCalls, 0);
    }
  } finally {
    globalThis.fetch = original;
  }
});
test('a temporary profile failure retains known dates; positively changed evidence invalidates its mapping', async () => {
  const fixture = film(0),
    original = globalThis.fetch;
  try {
    for (const changed of [false, true]) {
      const fake = store([
        {
          ...fixture,
          row: {
            ...fixture.row,
            profile_checked_at: new Date(Date.now() - 2 * SIX_HOURS).toISOString(),
          },
        },
      ]);
      globalThis.fetch = async (url) =>
        String(url) === fixture.entry.report.release.source
          ? new Response(fixture.article)
          : String(url) === fixture.profile.sourceFilmUrl
            ? changed
              ? new Response(fixture.page.replace('Director: A Director', 'Director: Someone Else'))
              : new Response('Unavailable', { status: 503 })
            : Response.json({ metas: [] });
      const result = await expandReleases([fixture.entry], { db: fake.db, publishUnknown: true });
      assert.equal(result.matched, 0);
      assert.equal(fake.writes.length, changed ? 1 : 0);
      if (changed)
        assert.equal((fake.writes[0].args.p_match as { status: string }).status, 'pending');
    }
  } finally {
    globalThis.fetch = original;
  }
});
test('expired work carries over rather than receiving a 24-hour unresolved backoff', async () => {
  const fixtures = [film(0), film(1)],
    fake = store(fixtures),
    original = globalThis.fetch;
  globalThis.fetch = async (_url, init) =>
    new Promise((_, reject) => {
      const hold = setTimeout(() => reject(Error('delayed')), 100);
      init?.signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(hold);
          reject(Error('aborted'));
        },
        { once: true },
      );
    });
  try {
    const result = await expandReleases(
      fixtures.map((f) => f.entry),
      { db: fake.db, budgetMs: 10, publishUnknown: true },
    );
    assert.equal(result.matched, 0);
    assert.equal(fake.writes.length, 0);
    assert.ok(fake.state.feed.every((entry) => !entry.nextCheckAt));
  } finally {
    globalThis.fetch = original;
  }
});
test('explicit Movie IDs work without a native crosswalk and known structured reports continue while new imports are paused', async () => {
  const fixture = film(0),
    original = globalThis.fetch;
  const schema = {
    '@type': 'Movie',
    name: fixture.movie.title,
    sameAs: fixture.movie.source,
    datePublished: '2026-01-01',
  };
  const html =
    fixture.article.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/, '$1') +
    `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
  globalThis.fetch = async (url) => {
    assert.equal(String(url), fixture.entry.report.release.source);
    return new Response(html);
  };
  try {
    const fake = store([fixture]);
    const result = await expandReleases([{ ...fixture.entry, movieId: fixture.movie.id }], {
      db: fake.db,
      publishUnknown: false,
    });
    assert.equal(result.matched, 1);
    assert.equal(result.decisions[0].method, 'structured');
    assert.equal(fake.writes[0].args.p_match, null);
  } finally {
    globalThis.fetch = original;
  }
});

test('targeted older reports preserve the shared feed checkpoint and reject a different IMDb subject', async () => {
  const fixture = film(0),
    fake = store([fixture]),
    original = globalThis.fetch;
  globalThis.fetch = async (url) =>
    new Response(String(url) === fixture.profile.sourceFilmUrl ? fixture.page : fixture.article);
  try {
    const different = await expandReleases([fixture.entry], {
      db: fake.db,
      publishUnknown: true,
      checkpoint: false,
      expectedImdbId: 'tt1111111',
    });
    assert.equal(different.matched, 0);
    assert.equal(different.decisions[0].outcome, 'different_film_identity');
    assert.equal(fake.writes.length, 0);
    assert.deepEqual(fake.state.feed, []);
    const matched = await expandReleases([fixture.entry], {
      db: fake.db,
      publishUnknown: true,
      checkpoint: false,
      expectedImdbId: fixture.movie.imdbId,
    });
    assert.equal(matched.matched, 1);
    assert.equal(fake.writes.length, 1);
    assert.deepEqual(fake.state.feed, []);
  } finally {
    globalThis.fetch = original;
  }
});

test('temporary report availability failures retry after fifteen minutes, separately from identity evidence', async () => {
  const fixture = film(0),
    fake = store([fixture]),
    original = globalThis.fetch;
  globalThis.fetch = async () => new Response('Unavailable', { status: 503 });
  try {
    await expandReleases([fixture.entry], { db: fake.db, publishUnknown: true });
    const delay = Date.parse(fake.state.feed[0].nextCheckAt!) - Date.now();
    assert.ok(delay > 14 * 60_000 && delay <= 15 * 60_000);
    assert.equal(fake.writes.length, 0);
  } finally {
    globalThis.fetch = original;
  }
});
test('feed health detects malformed successful HTTP responses and retains the previous reports', async () => {
  const { expansionFeed } = await import('../lib/release-expansion');
  const { createClient } = await import('@supabase/supabase-js');
  const fixture = film(0),
    original = globalThis.fetch,
    writes: Record<string, unknown>[] = [],
    checks: Record<string, unknown>[] = [];
  const db = createClient('https://feed.test', 'test', {
    auth: { persistSession: false },
    global: {
      fetch: async (input, init) => {
        const body = JSON.parse(String(init?.body));
        if (String(input).includes('/rpc/a_list_record_source_check')) checks.push(body);
        else if (String(input).includes('/rpc/')) {
          /* durable queue writes are tested separately */
        } else writes.push(body);
        return Response.json(null);
      },
    },
  });
  try {
    globalThis.fetch = async () =>
      new Response('<html><h2>Verify your browser</h2>' + padding + '</html>');
    const retained = await expansionFeed(
      { wts_feed: [fixture.entry] },
      AbortSignal.timeout(5000),
      db,
    );
    assert.deepEqual(retained, [fixture.entry]);
    assert.equal(checks[0].p_success, false);
    assert.ok(Date.parse(String(writes[0].wts_feed_after)) - Date.now() <= 15 * 60_000);
    globalThis.fetch = async () => new Response('<rss><channel>' + padding + '</channel></rss>');
    await expansionFeed(
      {
        wts_feed: [fixture.entry],
        wts_feed_after: new Date(Date.now() + 6 * 3600_000).toISOString(),
      },
      AbortSignal.timeout(5000),
      db,
    );
    assert.equal(checks[1].p_success, true);
    const delay = Date.parse(String(writes[1].wts_feed_after)) - Date.now();
    assert.ok(delay > 8 * 60_000 && delay <= 9 * 60_000);
    globalThis.fetch = async () => {
      throw Error('a recent discovery snapshot must be reused');
    };
    const cached = await expansionFeed(
      { wts_feed: [fixture.entry], wts_feed_after: String(writes[1].wts_feed_after) },
      AbortSignal.timeout(5000),
      db,
    );
    assert.deepEqual(cached, [fixture.entry]);
    assert.equal(checks.length, 2);
    assert.equal(writes.length, 2);
  } finally {
    globalThis.fetch = original;
  }
});

test('background incomplete profiles retain approved mappings with transient retries', async () => {
  const fixture = film(0),
    original = globalThis.fetch;
  try {
    for (const broken of [
      '<h1>Verify your browser</h1>' + padding,
      fixture.page.replace('<p>Synopsis: ' + fixture.profile.overview + '</p>', ''),
      fixture.page.replace(`<link rel="canonical" href="${fixture.profile.sourceFilmUrl}">`, ''),
    ]) {
      const fake = store([
        { ...fixture, row: { ...fixture.row, profile_checked_at: '2026-01-01T00:00:00Z' } },
      ]);
      globalThis.fetch = async (url) =>
        new Response(
          String(url) === fixture.entry.report.release.source ? fixture.article : broken,
        );
      const result = await expandReleases([fixture.entry], { db: fake.db, publishUnknown: true });
      assert.equal(result.decisions[0].outcome, 'source_unavailable');
      assert.equal(fake.writes.length, 0);
      assert.ok(Date.parse(fake.state.feed[0].nextCheckAt!) - Date.now() < 16 * 60_000);
    }
  } finally {
    globalThis.fetch = original;
  }
});

test('native all-TBA publication withdraws only explicit windows with a row-version guard', async () => {
  const fixture = film(0);
  fixture.movie.releases = [
    { ...fixture.entry.report.release, source: fixture.profile.sourceFilmUrl },
  ];
  const fake = store([fixture]);
  const html = fixture.page.replace(
    '</article>',
    '<p>VOD Release Date: TBA</p><p>SVOD Release Date: TBA</p></article>',
  );
  const report = {
    ...fixture.entry.report,
    release: { ...fixture.entry.report.release, source: fixture.profile.sourceFilmUrl },
  };
  const result = await expandReleases(mergeReleaseFeed([], [report], now), {
    db: fake.db,
    publishUnknown: true,
    checkpoint: false,
    sourcePages: new Map([[fixture.profile.sourceFilmUrl, html]]),
  });
  assert.equal(result.decisions[0].outcome, 'withheld');
  assert.equal(result.decisions[0].audit?.withdrawn, 1);
  const write = fake.writes.find((w) => w.name === 'a_list_withdraw_release_windows')!;
  assert.ok(write);
  assert.deepEqual(write.args.p_kinds, ['Digital', 'Subscription']);
  assert.equal(write.args.p_version, now);
  assert.equal(
    fake.writes.some((w) => w.name === 'a_list_withhold_release_report'),
    false,
  );
});

test('inventory rejects a TV series before matching or publishing', async () => {
  const fixture = film(0),
    fake = store([fixture]);
  const source = fixture.profile.sourceFilmUrl;
  const entry = {
    ...fixture.entry,
    sourceId: fixture.profile.sourceFilmId,
    report: {
      ...fixture.entry.report,
      inventory: true,
      release: { ...fixture.entry.report.release, source },
    },
  };
  const result = await expandReleases([entry], {
    db: fake.db,
    publishUnknown: true,
    checkpoint: false,
    sourcePages: new Map([
      [
        source,
        fixture.page.replace(
          '</article>',
          '<p>Genre: TV Series</p><p>VOD Release Date: November 11, 2026</p></article>',
        ),
      ],
    ]),
  });
  assert.equal(result.decisions[0].outcome, 'not_movie');
  assert.ok(!fake.writes.some((w) => w.args.p_movie));
  assert.ok(
    fake.writes.some((w) => (w.args.p_match as { status?: string })?.status === 'pending'),
    'A newly identified series invalidates an older approved movie mapping',
  );
});

test('changed profile plus a metadata outage does not invalidate established identity evidence', async () => {
  const fixture = film(0),
    fake = store([
      { ...fixture, row: { ...fixture.row, profile_checked_at: '2026-01-01T00:00:00Z' } },
    ]),
    original = globalThis.fetch;
  globalThis.fetch = async (url) =>
    String(url) === fixture.entry.report.release.source
      ? new Response(fixture.article)
      : String(url) === fixture.profile.sourceFilmUrl
        ? new Response(
            fixture.page.replace('A family searches for an island.', 'A revised synopsis.'),
          )
        : new Response('Unavailable', { status: 503 });
  try {
    const result = await expandReleases([fixture.entry], { db: fake.db, publishUnknown: true });
    assert.equal(result.decisions[0].outcome, 'source_unavailable');
    assert.equal(fake.writes.length, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test('an independently identified target corroborates its exact metadata instead of rejecting a broad namesake search', async () => {
  const fixture = film(0),
    fake = store([fixture]),
    original = globalThis.fetch;
  fake.rows.clear();
  const page = fixture.page.replace(
    '</article>',
    '<p>SVOD Release Date: November 11, 2026 (Netflix)</p></article>',
  );
  globalThis.fetch = async (url) => {
    if (String(url) === fixture.profile.sourceFilmUrl) return new Response(page);
    assert.equal(
      String(url),
      `https://v3-cinemeta.strem.io/meta/movie/${fixture.movie.id}.json`,
      'Known targets do not use title search to rediscover their own ID',
    );
    return Response.json({
      meta: {
        type: 'movie',
        id: fixture.movie.id,
        name: fixture.movie.title,
        releaseInfo: '2026',
        director: ['A Director'],
        cast: ['First Actor'],
        credits_cast: [{ name: 'Second Actor' }],
      },
    });
  };
  try {
    const reports = parseProfileReports(page, fixture.profile);
    const result = await expandReleases(mergeReleaseFeed([], reports, now), {
      db: fake.db,
      publishUnknown: true,
      expectedImdbId: fixture.movie.id,
      expectedMovie: fixture.movie,
    });
    assert.equal(result.matched, 1);
    assert.equal((fake.writes[0].args.p_movie as Movie).releases[0].date, '2026-11-11');
  } finally {
    globalThis.fetch = original;
  }
});

test('known native films use explicitly identified primary credits when metadata cast is incomplete, preserving native and calendar IDs', async () => {
  const fixture = film(0),
    fake = store([fixture]),
    original = globalThis.fetch;
  fake.rows.clear();
  const native: Movie = {
    ...fixture.movie,
    id: '123',
    source: 'https://www.dvdsreleasedates.com/movies/123/film-0',
    identityVerifiedAt: now,
  };
  fake.movies.set(native.id, { id: native.id, movie: native, updated_at: now });
  const page = fixture.page.replace(
    '</article>',
    '<p>SVOD Release Date: November 11, 2026 (Netflix)</p></article>',
  );
  const person = (kind: string, name: string) =>
    `<span itemprop='${kind}'><a href='/people/1'><span itemprop='name'>${name}</span></a></span>`;
  const primary = `<link rel='canonical' href='${native.source}'><h1>${native.title} (2026)</h1><a itemprop='sameAs' href='https://www.imdb.com/title/${fixture.movie.id}/'>IMDb</a>${person('director', 'A Director')}${person('actor', 'First Actor')}${person('actor', 'Second Actor')}${padding}`;
  globalThis.fetch = async (url) => {
    if (String(url) === fixture.profile.sourceFilmUrl) return new Response(page);
    if (String(url) === native.source) return new Response(primary);
    assert.equal(String(url), `https://v3-cinemeta.strem.io/meta/movie/${fixture.movie.id}.json`);
    return Response.json({
      meta: {
        type: 'movie',
        id: fixture.movie.id,
        name: fixture.movie.title,
        releaseInfo: '2026',
        director: ['A Director'],
        cast: ['First Actor'],
      },
    });
  };
  try {
    const result = await expandReleases(
      mergeReleaseFeed([], parseProfileReports(page, fixture.profile), now),
      {
        db: fake.db,
        publishUnknown: true,
        expectedImdbId: fixture.movie.id,
        expectedMovie: native,
      },
    );
    assert.equal(result.matched, 1);
    const stored = fake.writes[0].args.p_movie as Movie;
    assert.equal(stored.id, native.id);
    assert.equal(stored.imdbId, fixture.movie.id);
    assert.equal(stored.releases[0].filmImdbId, fixture.movie.id);
    assert.match(
      (fake.writes[0].args.p_match as { rationale: string }).rationale,
      /dvdsreleasedates/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('verified catalogue candidates avoid broad namesake searches during automatic profile discovery', async () => {
  const fixture = film(0),
    fake = store([fixture]),
    original = globalThis.fetch;
  fake.rows.clear();
  const source = fixture.profile.sourceFilmUrl;
  const entry = {
    ...fixture.entry,
    report: { ...fixture.entry.report, release: { ...fixture.entry.report.release, source } },
  };
  const html = fixture.page.replace(
    '</article>',
    '<p>VOD Release Date: November 11, 2026</p></article>',
  );
  try {
    globalThis.fetch = async (url) => {
      assert.equal(String(url), `https://v3-cinemeta.strem.io/meta/movie/${fixture.movie.id}.json`);
      return Response.json({
        meta: {
          type: 'movie',
          id: fixture.movie.id,
          name: fixture.movie.title,
          releaseInfo: '2026',
          director: ['A Director'],
          cast: ['First Actor', 'Second Actor'],
        },
      });
    };
    const result = await expandReleases([entry], {
      db: fake.db,
      publishUnknown: true,
      checkpoint: false,
      sourcePages: new Map([[source, html]]),
      knownMovies: [fixture.movie],
    });
    assert.equal(result.matched, 1);
    assert.equal(result.decisions[0].imdbId, fixture.movie.id);
  } finally {
    globalThis.fetch = original;
  }
});

test('inventory checks current approved announcements when profiles are TBA and retires actual withdrawals without restoring snapshots', async () => {
  const fixture = film(0),
    mapping = cachedIdentity(fixture.row)!,
    original = globalThis.fetch;
  fixture.row.reports = [
    parseVerifiedReport(fixture.article, { ...fixture.entry.report, imdbId: fixture.movie.id }, [
      mapping,
    ])!,
  ];
  const fake = store([fixture]),
    source = fixture.profile.sourceFilmUrl;
  const page = fixture.page.replace(
    '</article>',
    '<p>VOD Release Date: TBA</p><p>SVOD Release Date: TBA</p></article>',
  );
  const entry = {
    ...fixture.entry,
    report: { ...fixture.entry.report, release: { ...fixture.entry.report.release, source } },
  };
  try {
    globalThis.fetch = async (url) => {
      assert.equal(String(url), fixture.entry.report.release.source);
      return new Response(fixture.article);
    };
    const result = await expandReleases([entry], {
      db: fake.db,
      publishUnknown: true,
      checkpoint: false,
      sourcePages: new Map([[source, page]]),
    });
    assert.equal(result.matched, 1);
    assert.equal(fake.movies.get(fixture.movie.id)?.movie.releases[0].date, '2026-11-11');
    globalThis.fetch = async () =>
      new Response(
        fixture.article.replace(
          'is arriving on Netflix on November 11, 2026.',
          'has no date; its release was withdrawn.',
        ),
      );
    const withdrawn = await expandReleases([entry], {
      db: fake.db,
      publishUnknown: true,
      checkpoint: false,
      sourcePages: new Map([[source, page]]),
    });
    assert.equal(withdrawn.decisions[0].outcome, 'withheld');
    assert.equal(withdrawn.decisions[0].audit?.withdrawn, 1);
    assert.ok(
      fake.writes.some(
        (w) =>
          w.name === 'a_list_withhold_release_report' &&
          w.args.p_source === fixture.entry.report.release.source,
      ),
    );
    fake.writes.length = 0;
    globalThis.fetch = async () => new Response('Unavailable', { status: 503 });
    const failed = await expandReleases([entry], {
      db: fake.db,
      publishUnknown: true,
      checkpoint: false,
      sourcePages: new Map([[source, page]]),
    });
    assert.equal(failed.decisions[0].outcome, 'source_unavailable');
    assert.equal(fake.writes.length, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test('all-TBA retains verified identity without manufacturing releases; malformed fields remain partial', async () => {
  for (const field of ['TBA', 'TB A', 'T B D', 'N/A', 'not applicable', 'Coming soon']) {
    const fixture = film(0),
      fake = store([fixture]);
    const html = fixture.page.replace(
      '</article>',
      `<p>VOD Release Date: ${field}</p><p>SVOD Release Date: TBA</p></article>`,
    );
    const report = {
      ...fixture.entry.report,
      release: { ...fixture.entry.report.release, source: fixture.profile.sourceFilmUrl },
    };
    const result = await expandReleases(mergeReleaseFeed([], [report], now), {
      db: fake.db,
      publishUnknown: true,
      checkpoint: false,
      sourcePages: new Map([[fixture.profile.sourceFilmUrl, html]]),
    });
    assert.equal(result.decisions[0].outcome, 'verified_no_date');
    assert.equal(!!result.decisions[0].partial, field === 'Coming soon');
    assert.ok(fake.writes.some((w) => w.name === 'a_list_store_release_identity'));
    assert.ok(!fake.writes.some((w) => w.name === 'a_list_store_release_match'));
  }
});

test('service originals with N/A rental fields publish a complete subscription window and stable calendar event', async () => {
  const fixture = film(0),
    fake = store([fixture]);
  const source = fixture.profile.sourceFilmUrl;
  const page = fixture.page.replace(
    '</article>',
    '<p>PVOD Release Date: N/A</p><p>SVOD Release Date: December 11, 2026 (Netflix)</p></article>',
  );
  const entry = {
    ...fixture.entry,
    report: { ...fixture.entry.report, release: { ...fixture.entry.report.release, source } },
  };
  const evidence = profileReleaseEvidence(page, fixture.profile);
  assert.deepEqual(evidence.malformedKinds, []);
  assert.deepEqual(evidence.withdrawnKinds, ['PVOD']);
  for (let pass = 0; pass < 2; pass++) {
    const result = await expandReleases([entry], {
      db: fake.db,
      publishUnknown: true,
      checkpoint: false,
      sourcePages: new Map([[source, page]]),
    });
    assert.equal(result.matched, 1);
    assert.equal(result.decisions[0].partial, undefined);
    const movie = fake.movies.get(fixture.movie.id)!.movie;
    assert.deepEqual(
      movie.releases.map((r) => [r.kind, r.date]),
      [['Subscription', '2026-12-11']],
    );
    const calendar = makeCalendar([{ ...movie, tracked: true }], { now: new Date(now) });
    assert.equal((calendar.match(/BEGIN:VEVENT/g) || []).length, 1);
    assert.match(calendar, /DTSTART:20261211T130000Z/);
    assert.match(calendar, /TRIGGER;RELATED=START:PT0S/);
    assert.match(calendar, /UID:movie-tt7000000-subscription@afterlight/);
  }
});

test('punctuated profile dates publish only the home window and never the theatrical date', async () => {
  const fixture = film(0);
  fixture.profile.facts = { theatrical: '2026-06-10' };
  fixture.row.fingerprint = fixture.row.reviewed_fingerprint = profileFingerprint(fixture.profile);
  const fake = store([fixture]);
  const source = fixture.profile.sourceFilmUrl;
  const page = fixture.page.replace(
    '</article>',
    '<p>Theater Date: June 10. 2026</p><p>VOD Release Date: July 17. 2026</p><p>SVOD Release Date: TBA</p></article>',
  );
  const entry = {
    ...fixture.entry,
    report: { ...fixture.entry.report, release: { ...fixture.entry.report.release, source } },
  };
  const result = await expandReleases([entry], {
    db: fake.db,
    publishUnknown: true,
    checkpoint: false,
    sourcePages: new Map([[source, page]]),
  });
  assert.equal(result.matched, 1);
  assert.equal(result.decisions[0].partial, undefined);
  assert.deepEqual(
    fake.movies.get(fixture.movie.id)!.movie.releases.map((r) => [r.kind, r.date]),
    [['Digital', '2026-07-17']],
  );
});

test('a successful WTS recheck clears only recovered WTS issues and retains other provider failures', async () => {
  for (const keepPrimary of [false, true]) {
    const fixture = film(0);
    const remaining = keepPrimary
      ? [{ provider: 'primary' as const, category: 'timeout' as const }]
      : [];
    fixture.movie.releaseCheck = {
      status: 'partial',
      attemptedAt: profileTime,
      issues: [{ provider: 'wts', category: 'format_changed' }, ...remaining],
    };
    const fake = store([fixture]);
    const source = fixture.profile.sourceFilmUrl;
    const page = fixture.page.replace(
      '</article>',
      '<p>PVOD Release Date: N/A</p><p>SVOD Release Date: December 11, 2026 (Netflix)</p></article>',
    );
    const entry = {
      ...fixture.entry,
      report: { ...fixture.entry.report, release: { ...fixture.entry.report.release, source } },
    };
    await expandReleases([entry], {
      db: fake.db,
      publishUnknown: true,
      checkpoint: false,
      sourcePages: new Map([[source, page]]),
    });
    const movie = fake.movies.get(fixture.movie.id)!.movie;
    assert.deepEqual(movie.releaseCheck?.issues, remaining);
    assert.equal(movie.releaseCheck?.status, keepPrimary ? 'partial' : 'fresh');
  }
});

test('unusable metadata identities stay unresolved without withdrawing last-good WTS dates', async () => {
  const original = globalThis.fetch;
  try {
    for (const expected of [
      'metadata_not_listed',
      'metadata_identity_conflict',
      'identity_evidence_conflict',
    ]) {
      const raw =
        expected === 'metadata_not_listed'
          ? null
          : { id: 'tt9999999', type: 'movie', name: 'Film 0', releaseInfo: '2026' };
      const fixture = film(0),
        fake = store([fixture]);
      fixture.movie.releases = [
        {
          ...fixture.entry.report.release,
          source: fixture.profile.sourceFilmUrl,
          filmImdbId: fixture.movie.id,
          filmIdentityMethod: 'reviewed',
          filmIdentitySource: fixture.profile.sourceFilmUrl,
        },
      ];
      const before = structuredClone(fixture.movie.releases);
      const page = fixture.page
        .replace(fixture.profile.overview!, 'An edited synopsis requiring fresh corroboration.')
        .replace('</article>', '<p>SVOD Release Date: December 11, 2026 (Netflix)</p></article>');
      globalThis.fetch = async (url) => {
        if (String(url).includes('v3-cinemeta.strem.io')) return Response.json({ meta: raw });
        if (expected === 'identity_evidence_conflict')
          throw new Error('Film source identity mismatch');
        return new Response('<div>No results found</div>' + padding);
      };
      const source = fixture.profile.sourceFilmUrl;
      const entry = {
        ...fixture.entry,
        report: { ...fixture.entry.report, release: { ...fixture.entry.report.release, source } },
      };
      const result = await expandReleases([entry], {
        db: fake.db,
        publishUnknown: true,
        checkpoint: false,
        sourcePages: new Map([[source, page]]),
        knownMovies: [fixture.movie],
      });
      assert.equal(result.decisions[0].outcome, expected);
      assert.equal(result.matched, 0);
      assert.deepEqual(fake.movies.get(fixture.movie.id)!.movie.releases, before);
      assert.ok(
        !fake.writes.some((w) =>
          [
            'a_list_store_release_match',
            'a_list_withhold_release_report',
            'a_list_withdraw_release_windows',
          ].includes(w.name),
        ),
      );
    }
  } finally {
    globalThis.fetch = original;
  }
});

test('catch-up processes more than five entries once, checkpoints durable work and retains the bounded recent snapshot', async () => {
  const fixtures = Array.from({ length: 12 }, (_, i) => film(100 + i));
  const fake = store(fixtures);
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      const found = fixtures.find(
        (f) =>
          f.entry.report.release.source === String(url) || f.profile.sourceFilmUrl === String(url),
      );
      if (!found) throw new Error('Unexpected source');
      return new Response(String(url) === found.profile.sourceFilmUrl ? found.page : found.article);
    };
    const feed = fixtures.map((f) => f.entry);
    const result = await expandReleases(
      [
        ...feed,
        ...feed.map((entry) => ({ ...entry, durable: true, queueVersion: 0, attempts: 0 })),
      ],
      { db: fake.db, publishUnknown: true, limit: 16 },
    );
    assert.equal(result.processed, 12);
    assert.equal(result.matched, 12);
    assert.equal(fake.state.feed.length, 12);
    assert.ok(fake.state.feed.every((entry) => !entry.durable && entry.queueVersion === undefined));
    const checkpoint = fake.writes.find(
      (write) => write.name === 'a_list_checkpoint_wts_announcements',
    );
    assert.equal((checkpoint?.args.p_entries as unknown[]).length, 12);
  } finally {
    globalThis.fetch = original;
  }
});
