import test from 'node:test';
import assert from 'node:assert/strict';
import { corroborateCandidates, knownProfileMovies } from '../lib/release-matching';
import type { Movie } from '../lib/model';
import { samePersonName } from '../lib/release-evidence';
const profile = {
  sourceFilmId: '7001',
  sourceFilmUrl: 'https://whentostream.com/a-film-2026/',
  title: 'A Film',
  year: '2026',
  directors: ['A Director'],
  cast: ['First Actor', 'Second Actor'],
  overview: 'A fictional film.',
};
const movie: Movie = {
  id: '123',
  imdbId: 'tt7777777',
  identityVerifiedAt: '2026-10-29T00:00:00Z',
  title: 'A Film',
  year: '2026',
  source: 'https://www.dvdsreleasedates.com/movies/123/a-film',
  poster: '',
  checkedAt: '2026-10-29T00:00:00Z',
  releases: [],
};
const person = (kind: string, name: string) =>
  `<a itemprop='${kind}'><span itemprop='name'>${name}</span></a>`;
const page = `<link rel='canonical' href='${movie.source}'><h1>A Film (2026)</h1><a itemprop='sameAs' href='https://www.imdb.com/title/tt7777777/'>IMDb</a>${person('director', 'A Director')}${person('actor', 'First Actor')}${person('actor', 'Second Actor')}${'.'.repeat(600)}`;
test('local shortlists deduplicate exact IMDb aliases, prefer native evidence and exclude unverified/series records', () => {
  const metadata = { ...movie, id: 'tt7777777', source: 'https://www.imdb.com/title/tt7777777/' };
  assert.deepEqual(
    knownProfileMovies(profile, [
      metadata,
      movie,
      { ...movie, id: '456', identityVerifiedAt: undefined },
      { ...movie, id: '789', mediaType: 'series' },
    ]),
    [movie],
  );
  assert.deepEqual(knownProfileMovies({ ...profile, title: 'A Director’s A Film' }, [movie]), [
    movie,
  ]);
});
test('fiction uses independently verified primary credits when metadata is incomplete or unavailable', async () => {
  const original = globalThis.fetch;
  try {
    for (const outage of [false, true]) {
      globalThis.fetch = async (url) =>
        String(url) === movie.source
          ? new Response(page)
          : outage
            ? new Response('Unavailable', { status: 503 })
            : Response.json({
                meta: {
                  type: 'movie',
                  id: 'tt7777777',
                  name: 'A Film',
                  releaseInfo: '2026',
                  director: ['A Director'],
                  cast: ['First Actor'],
                },
              });
      const evidence = await corroborateCandidates(profile, [movie], AbortSignal.timeout(1000));
      assert.equal(evidence.movie.id, 'tt7777777');
      assert.equal(evidence.primaryIdentityVerified, true);
    }
  } finally {
    globalThis.fetch = original;
  }
});
test('failed candidates cannot manufacture uniqueness and TV source pages cannot supply film evidence', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url) =>
      String(url) === movie.source
        ? new Response(page)
        : new Response('Unavailable', { status: 503 });
    await assert.rejects(
      corroborateCandidates(
        profile,
        [
          movie,
          {
            ...movie,
            id: 'tt8888888',
            imdbId: 'tt8888888',
            source: 'https://www.imdb.com/title/tt8888888/',
          },
        ],
        AbortSignal.timeout(1000),
      ),
    );
    globalThis.fetch = async (url) =>
      String(url) === movie.source
        ? new Response(page.replace('(2026)', '(TV Series 2026)'))
        : new Response('Unavailable', { status: 503 });
    await assert.rejects(
      corroborateCandidates(profile, [movie], AbortSignal.timeout(1000)),
      /TV series/,
    );
    globalThis.fetch = async (url) =>
      String(url) === movie.source
        ? new Response(page)
        : Response.json({ meta: { type: 'series', id: 'tt7777777', name: 'A Film' } });
    await assert.rejects(
      corroborateCandidates(profile, [movie], AbortSignal.timeout(1000)),
      /insufficient_evidence/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('crowded ordinary titles use years to shortlist while retaining unknown and competing identities', async () => {
  const original = globalThis.fetch;
  const candidates = ['1980', '2000', '2010', '2024', '2026'].map((year, index) => ({
    ...movie,
    id: `tt777777${index}`,
    imdbId: `tt777777${index}`,
    source: `https://www.imdb.com/title/tt777777${index}/`,
    year,
  }));
  const requested: string[] = [];
  try {
    globalThis.fetch = async (url) => {
      requested.push(String(url));
      const id = String(url).match(/tt\d+/)?.[0];
      if (id === 'tt8888888') return new Response('Unavailable', { status: 503 });
      if (!id) return new Response('Unavailable', { status: 503 });
      const correct = id === 'tt7777774';
      return Response.json({
        meta: {
          id,
          type: 'movie',
          name: 'A Film',
          releaseInfo: correct ? '2026' : '2024',
          director: [correct ? 'A Director' : 'Other Director'],
          cast: correct ? ['First Actor', 'Second Actor'] : ['Different Actor'],
        },
      });
    };
    const evidence = await corroborateCandidates(profile, candidates, AbortSignal.timeout(1000));
    assert.equal(evidence.movie.id, 'tt7777774');
    assert.equal(requested.length, 2);
    requested.length = 0;
    await assert.rejects(
      corroborateCandidates(
        profile,
        [
          ...candidates,
          {
            ...movie,
            id: 'tt8888888',
            imdbId: 'tt8888888',
            year: '',
            source: 'https://www.imdb.com/title/tt8888888/',
          },
        ],
        AbortSignal.timeout(1000),
      ),
    );
    assert.ok(requested.some((url) => url.includes('tt8888888')));
    await assert.rejects(
      corroborateCandidates(
        { ...profile, title: 'A Film 40th Anniversary' },
        candidates,
        AbortSignal.timeout(1000),
      ),
      /ambiguous/,
    );
    await assert.rejects(
      corroborateCandidates(
        profile,
        candidates.map((candidate) => ({ ...candidate, year: '2026' })),
        AbortSignal.timeout(1000),
      ),
      /ambiguous/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('full-name order and hyphen variants agree without accepting initials, omissions or typos', () => {
  for (const pair of [
    ['Kim Byung-woo', 'Byungwoo Kim'],
    ['Lee Sang-il', 'Sang-il Lee'],
    ['Ángel Manuel Soto', 'Angel Manuel Soto'],
  ])
    assert.equal(samePersonName(...(pair as [string, string])), true);
  for (const pair of [
    ['Kim Byung-woo', 'Kim Ji-woon'],
    ['A Director', 'B Director'],
    ['Morgan Neville', 'Mogan Neville'],
    ['Paul Thomas Anderson', 'Paul Anderson'],
    ['John Smith', 'J Smith'],
  ])
    assert.equal(samePersonName(...(pair as [string, string])), false);
});

test('verified primary and metadata evidence retain complementary credits but reject contradictory directors', async () => {
  const original = globalThis.fetch;
  let primaryPage = page.replace(person('actor', 'First Actor'), '');
  try {
    globalThis.fetch = async (url) =>
      String(url) === movie.source
        ? new Response(primaryPage)
        : Response.json({
            meta: {
              type: 'movie',
              id: 'tt7777777',
              name: 'A Film',
              releaseInfo: '2026',
              director: ['A Director'],
              cast: ['First Actor'],
              description: 'Metadata synopsis.',
              runtime: '90 min',
            },
          });
    const evidence = await corroborateCandidates(profile, [movie], AbortSignal.timeout(1000));
    assert.equal(evidence.primaryIdentityVerified, true);
    assert.deepEqual(new Set(evidence.cast), new Set(['First Actor', 'Second Actor']));
    assert.equal(evidence.movie.overview, 'Metadata synopsis.');
    assert.equal(evidence.facts?.runtime, 90);
    primaryPage = primaryPage.replace('A Director', 'Other Director');
    await assert.rejects(
      corroborateCandidates(profile, [movie], AbortSignal.timeout(1000)),
      /insufficient/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('a positively excluded series namesake cannot reject a corroborated film, but unavailable candidates still block uniqueness', async () => {
  const original = globalThis.fetch;
  const other = {
    ...movie,
    id: 'tt8888888',
    imdbId: 'tt8888888',
    source: 'https://www.imdb.com/title/tt8888888/',
  };
  try {
    let unavailable = false;
    globalThis.fetch = async (url) => {
      const id = String(url).match(/tt\d+/)?.[0];
      if (id === other.id && unavailable) return new Response('Unavailable', { status: 503 });
      return Response.json({
        meta: {
          id,
          type: id === other.id ? 'series' : 'movie',
          name: 'A Film',
          releaseInfo: '2026',
          director: ['A Director'],
          cast: ['First Actor', 'Second Actor'],
        },
      });
    };
    assert.equal(
      (await corroborateCandidates(profile, [movie, other], AbortSignal.timeout(1000))).movie.id,
      movie.imdbId,
    );
    unavailable = true;
    await assert.rejects(corroborateCandidates(profile, [movie, other], AbortSignal.timeout(1000)));
  } finally {
    globalThis.fetch = original;
  }
});
