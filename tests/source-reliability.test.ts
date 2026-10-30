import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshMovie, type SourceResult } from '../lib/movie-refresh';
import { parseDetail } from '../lib/sources';
import { sourceHealthSummary } from '../lib/source-health';
import type { Movie } from '../lib/model';
import { profileFingerprint } from '../lib/release-profile';
const stamp = '2026-10-25T00:00:00Z',
  padding = '<!--' + '.'.repeat(600) + '-->';
const film: Movie = {
  id: '123',
  title: 'A Film',
  year: '2026',
  imdbId: 'tt1234567',
  identityVerifiedAt: stamp,
  poster: '',
  source: 'https://www.dvdsreleasedates.com/movies/123/a-film',
  overview: 'A synopsis.',
  checkedAt: stamp,
  releaseCheckedAt: stamp,
  releases: [
    {
      kind: 'Digital',
      date: '2026-10-01',
      source: 'https://www.dvdsreleasedates.com/movies/123/a-film',
      sourceName: 'DVDs Release Dates',
      confidence: 'listed',
    },
    {
      kind: 'Subscription',
      platform: 'Netflix',
      date: '2026-11-01',
      source: 'https://whentostream.com/a-film-streaming/',
      sourceName: 'When To Stream',
      confidence: 'listed',
      filmImdbId: 'tt1234567',
      filmIdentityMethod: 'structured',
    },
  ],
};
const article =
  '<script type="application/ld+json">' +
  JSON.stringify({
    '@type': 'Movie',
    name: film.title,
    sameAs: 'https://www.imdb.com/title/tt1234567/',
    datePublished: '2026-01-01',
  }) +
  '</script><div itemprop="articleBody"><p>A Film is arriving on Netflix on November 3, 2026.</p></div>' +
  padding;
test('WTS revalidates independently while the primary fails, preserving primary dates and last full check', async () => {
  const original = globalThis.fetch,
    checks: SourceResult[] = [];
  let wtsStarted = false;
  globalThis.fetch = async (url) => {
    if (String(url).includes('whentostream.com')) {
      wtsStarted = true;
      return new Response(article);
    }
    await Promise.resolve();
    assert.equal(wtsStarted, true);
    return new Response('Unavailable', { status: 503 });
  };
  try {
    const result = await refreshMovie(film, { onSourceResult: (r) => checks.push(r) });
    assert.equal(result.releases[0].date, '2026-10-01');
    assert.equal(result.releases[1].date, '2026-11-03');
    assert.equal(result.releaseCheckedAt, stamp);
    assert.deepEqual(
      checks.map(({ source, success }) => ({ source, success })),
      [
        { source: 'primary', success: false },
        { source: 'wts', success: true },
      ],
    );
    assert.deepEqual(checks[0].issue, { provider: 'primary', category: 'http_error', status: 503 });
    assert.equal(film.releases[1].date, '2026-11-01');
  } finally {
    globalThis.fetch = original;
  }
});
test('a successful WTS withdrawal still applies when the primary is unavailable', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) =>
    String(url).includes('whentostream.com')
      ? new Response(
          article.replace(
            'is arriving on Netflix on November 3, 2026.',
            'has no date; its release has been withdrawn.',
          ),
        )
      : new Response('Unavailable', { status: 503 });
  try {
    const result = await refreshMovie(film);
    assert.deepEqual(result.releases, [film.releases[0]]);
    assert.equal(result.releaseCheckedAt, stamp);
  } finally {
    globalThis.fetch = original;
  }
});

test('an unavailable crosswalk keeps a previously verified WTS window and schedules a partial retry', async () => {
  const original = globalThis.fetch;
  const saved = {
    ...film,
    releases: [
      film.releases[0],
      {
        ...film.releases[1],
        filmIdentityMethod: 'corroborated' as const,
        filmIdentitySource: 'https://whentostream.com/a-film-2026/',
      },
    ],
  };
  const checks: SourceResult[] = [];
  try {
    globalThis.fetch = async (url) =>
      new Response(
        String(url).includes('whentostream.com')
          ? '<div itemprop="articleBody"><p>A Film is arriving on Netflix on November 3, 2026.</p></div>' +
              padding
          : '<h2>Digital HD on October 1, 2026.</h2><a href="https://www.imdb.com/title/tt1234567/" itemprop="sameAs">IMDb</a>' +
              padding,
      );
    const result = await refreshMovie(saved, {
      identities: [],
      onSourceResult: (r) => checks.push(r),
    });
    assert.equal(
      result.releases.find((r) => r.sourceName === 'When To Stream')?.date,
      '2026-11-01',
    );
    assert.equal(result.releaseCheck?.status, 'partial');
    assert.equal(result.releaseCheckedAt, stamp);
    assert.ok(checks.some((r) => r.source === 'wts' && !r.success));
    globalThis.fetch = async (url) =>
      new Response(
        String(url).includes('whentostream.com')
          ? article.replace('tt1234567', 'tt7654321')
          : '<h2>Digital HD on October 1, 2026.</h2><a href="https://www.imdb.com/title/tt1234567/" itemprop="sameAs">IMDb</a>' +
              padding,
      );
    assert.ok(
      !(await refreshMovie(saved, { identities: [] })).releases.some(
        (r) => r.sourceName === 'When To Stream',
      ),
      'An explicit different IMDb subject must still withhold the window',
    );
  } finally {
    globalThis.fetch = original;
  }
});
test('edited profile evidence retains a verified date until rematched, while explicit withdrawals and changed native IDs still remove it', async () => {
  const original = globalThis.fetch,
    url = 'https://whentostream.com/a-film-2026/';
  const profile = {
    sourceFilmId: '7001',
    sourceFilmUrl: url,
    title: film.title,
    year: film.year,
    directors: ['A Director'],
    cast: ['First Actor', 'Second Actor'],
    overview: 'A synopsis.',
  };
  const identity = {
    ...profile,
    imdbId: film.imdbId!,
    method: 'corroborated' as const,
    reviewedAt: stamp,
    profileFingerprint: profileFingerprint(profile),
    evidence: { metadata: film.source, releaseSource: url, corroboration: 'Verified fixture' },
  };
  const saved = {
    ...film,
    releases: [
      film.releases[0],
      {
        ...film.releases[1],
        source: url,
        filmIdentityMethod: 'corroborated' as const,
        filmIdentitySource: url,
      },
    ],
  };
  let page = `<link rel="canonical" href="${url}"><article id="post-7001"><h1>A Film (2026)</h1><p>Director: A Director</p><p>Cast: First Actor, Second Actor</p><p>Synopsis: An edited synopsis.</p><p>SVOD Release Date: November 3, 2026 (Netflix)</p></article>${padding}`;
  try {
    globalThis.fetch = async (input) =>
      new Response(
        String(input).includes('whentostream.com')
          ? page
          : '<h2>Digital HD on October 1, 2026.</h2><a href="https://www.imdb.com/title/tt1234567/" itemprop="sameAs">IMDb</a>' +
              padding,
      );
    const result = await refreshMovie(saved, { identities: [identity] });
    assert.equal(
      result.releases.find((r) => r.sourceName === 'When To Stream')?.date,
      '2026-11-01',
    );
    assert.equal(result.releaseCheck?.status, 'partial');
    page = page.replace('November 3, 2026 (Netflix)', 'TBA');
    assert.ok(
      !(await refreshMovie(saved, { identities: [identity] })).releases.some(
        (r) => r.sourceName === 'When To Stream',
      ),
    );
    page = page.replace('post-7001', 'post-7002').replace('TBA', 'November 3, 2026 (Netflix)');
    assert.ok(
      !(await refreshMovie(saved, { identities: [identity] })).releases.some(
        (r) => r.sourceName === 'When To Stream',
      ),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('unexpected headings and unrelated native subjects cannot withdraw a legacy primary date', () => {
  const legacy = {
    ...film,
    imdbId: undefined,
    identityVerifiedAt: undefined,
    releases: [film.releases[0]],
  };
  for (const html of [
    '<h2>Please verify your browser</h2>',
    '<h2>DVD release date not announced</h2>',
    `<link rel="canonical" href="${film.source}"><h1>Another Film (2026)</h1><h2>DVD release date not announced</h2>`,
  ])
    assert.throws(() => parseDetail(html, legacy));
  const valid = `<link rel="canonical" href="${film.source}"><h1>A Film (2025)</h1><h2>DVD release date not yet announced</h2>`;
  assert.equal(
    parseDetail(valid, legacy).releases.length,
    0,
    'Recognised native subject permits a real withdrawal even when the stored year differs',
  );
  assert.equal(legacy.releases.length, 1);
});
test('source health detects individual failures and stale feed/catalogue data despite recent job success', () => {
  const now = Date.parse('2026-10-25T12:00:00Z'),
    recent = '2026-10-25T11:59:00Z',
    old = '2026-10-24T00:00:00Z';
  const status = {
    last_success_at: recent,
    catalogue_success_at: recent,
    failures: 0,
    source_health: { wts_feed: { ok: true, lastSuccess: recent } },
  };
  assert.equal(sourceHealthSummary(status, now).status, 'healthy');
  assert.ok(
    sourceHealthSummary(
      { ...status, source_health: { wts_feed: { ok: false, lastSuccess: recent } } },
      now,
    ).issues.includes('wts_feed_failed'),
  );
  const stale = sourceHealthSummary(
    {
      ...status,
      catalogue_success_at: old,
      source_health: { wts_feed: { ok: true, lastSuccess: old } },
    },
    now,
  );
  assert.ok(stale.issues.includes('catalogue_stale'));
  assert.ok(stale.issues.includes('wts_feed_stale'));
  assert.ok(
    sourceHealthSummary(
      {
        ...status,
        source_health: { ...status.source_health, wts_reports: { ok: false, lastSuccess: recent } },
      },
      now,
    ).issues.includes('wts_reports_failed'),
  );
});

test('approved director-credit titles refresh against the bound native subject and retain the canonical film ID', async () => {
  const original = globalThis.fetch,
    source = 'https://whentostream.com/a-directors-a-film-2026/';
  const profile = {
    sourceFilmId: '7001',
    sourceFilmUrl: source,
    title: 'A Director’s A Film',
    year: '2026',
    directors: ['A Director'],
    cast: ['First Actor', 'Second Actor'],
    overview: 'A synopsis.',
  };
  const identity = {
    ...profile,
    imdbId: film.imdbId!,
    method: 'corroborated' as const,
    reviewedAt: stamp,
    profileFingerprint: profileFingerprint(profile),
    evidence: {
      metadata: film.source,
      releaseSource: source,
      corroboration: 'Independent credits',
    },
  };
  const saved = {
    ...film,
    releases: [
      film.releases[0],
      {
        ...film.releases[1],
        source,
        filmIdentityMethod: 'corroborated' as const,
        filmIdentitySource: source,
      },
    ],
  };
  const html = `<link rel="canonical" href="${source}"><article id="post-7001"><h1>A Director’s A Film (2026)</h1><p>Director: A Director</p><p>Cast: First Actor, Second Actor</p><p>Synopsis: A synopsis.</p><p>SVOD Release Date: November 3, 2026 (Netflix)</p></article>${padding}`;
  try {
    globalThis.fetch = async (url) =>
      new Response(
        String(url) === source
          ? html
          : '<h2>Digital HD on October 1, 2026.</h2><a href="https://www.imdb.com/title/tt1234567/" itemprop="sameAs">IMDb</a>' +
              padding,
      );
    const result = await refreshMovie(saved, { identities: [identity] });
    assert.equal(result.id, film.id);
    assert.equal(
      result.releases.find((r) => r.sourceName === 'When To Stream')?.date,
      '2026-11-03',
    );
    assert.equal(result.releaseCheck?.status, 'fresh');
  } finally {
    globalThis.fetch = original;
  }
});
