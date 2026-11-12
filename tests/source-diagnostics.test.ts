import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceIssue, failedRefreshMovie } from '../lib/source-errors';
import { refreshMovie } from '../lib/movie-refresh';
import type { Movie } from '../lib/model';
const movie: Movie = {
  id: 'tt1234567',
  imdbId: 'tt1234567',
  title: 'A Film',
  year: '2026',
  poster: '',
  source: 'https://www.imdb.com/title/tt1234567/',
  checkedAt: '2026-10-24T00:00:00Z',
  releases: [],
};
const padding = '<!--' + '.'.repeat(600) + '-->';
test('diagnostics distinguish HTTP, timeouts, markup, identity and coverage without storing exception text', () => {
  assert.deepEqual(sourceIssue(new Error('Release source returned 503'), 'primary'), {
    provider: 'primary',
    category: 'http_error',
    status: 503,
  });
  assert.equal(
    sourceIssue(new DOMException('Timed out', 'TimeoutError'), 'primary').category,
    'timeout',
  );
  assert.equal(
    sourceIssue(new Error('Movie source format changed'), 'primary').category,
    'format_changed',
  );
  assert.equal(
    sourceIssue(new Error('Film source identity mismatch'), 'wts').category,
    'identity_conflict',
  );
  assert.equal(
    sourceIssue(new Error('Movie metadata not listed'), 'metadata').category,
    'not_listed',
  );
  assert.equal(
    JSON.stringify(sourceIssue(new Error('private-query-or-secret'), 'primary')).includes(
      'private-query-or-secret',
    ),
    false,
  );
});
test('missing metadata does not prevent an independent valid no-result release lookup', async () => {
  const original = globalThis.fetch;
  let searched = false;
  globalThis.fetch = async (url) => {
    if (String(url).includes('cinemeta'))
      return Response.json({ meta: { id: movie.id, type: 'movie' } });
    searched = true;
    return new Response('<p>No movies found</p>' + padding);
  };
  try {
    const result = await refreshMovie(movie);
    assert.equal(searched, true);
    assert.deepEqual(result.releases, []);
    assert.equal(result.metadataIssue?.category, 'not_listed');
    assert.equal(result.releaseCheck?.status, 'fresh');
    assert.equal(result.primaryListingUnavailable, true);
  } finally {
    globalThis.fetch = original;
  }
});
test('a failed refresh retains dates and returns per-film evidence for the stale-data UI', async () => {
  const original = globalThis.fetch;
  const current: Movie = {
    ...movie,
    id: '123',
    source: 'https://www.dvdsreleasedates.com/movies/123/a-film',
    releases: [
      {
        kind: 'Digital',
        date: '2026-11-03',
        confidence: 'listed',
        source: 'https://www.dvdsreleasedates.com/movies/123/a-film',
        sourceName: 'DVDs Release Dates',
      },
    ],
  };
  globalThis.fetch = async () => new Response('Unavailable', { status: 503 });
  try {
    let caught: unknown;
    try {
      await refreshMovie(current);
    } catch (error) {
      caught = error;
    }
    assert.ok(caught);
    const preserved = failedRefreshMovie(current, caught);
    assert.deepEqual(preserved.releases, current.releases);
    assert.equal(preserved.releaseCheck?.status, 'failed');
    assert.equal(preserved.releaseCheck?.issues[0].status, 503);
  } finally {
    globalThis.fetch = original;
  }
});

test('legacy identity repair allows refreshMovie to fetch the corrected film synopsis', async () => {
  const original = globalThis.fetch;
  const wrong: Movie = {
    ...movie,
    id: '123',
    imdbId: 'tt9999999',
    source: 'https://www.dvdsreleasedates.com/movies/123/a-film',
    overview: 'Wrong old plot.',
    overviewSource: 'https://v3-cinemeta.strem.io/meta/movie/tt9999999.json',
    metadataCheckedAt: movie.checkedAt,
    synopsisCheckedAt: movie.checkedAt,
  };
  let metadataCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url) === wrong.source)
      return new Response(
        `<link rel="canonical" href="${wrong.source}"><h1>A Film (2026)</h1><a itemprop="sameAs" href="https://www.imdb.com/title/tt1234567/">IMDb</a>${padding}`,
      );
    assert.equal(String(url), 'https://v3-cinemeta.strem.io/meta/movie/tt1234567.json');
    metadataCalls++;
    return Response.json({
      meta: {
        id: 'tt1234567',
        type: 'movie',
        name: 'A Film',
        year: '2026',
        description: 'The corrected plot.',
      },
    });
  };
  try {
    const result = await refreshMovie(wrong);
    assert.equal(metadataCalls, 1);
    assert.equal(result.overview, 'The corrected plot.');
    assert.equal(result.imdbId, 'tt1234567');
    assert.match(result.overviewSource!, /tt1234567/);
  } finally {
    globalThis.fetch = original;
  }
});

test('legacy HTML-escaped source paths are decoded before fetching and repaired without changing IDs', async () => {
  const original = globalThis.fetch;
  const source = 'https://www.dvdsreleasedates.com/movies/1730/Pan&#039;s-Labyrinth-(2006).html';
  const native = {
    ...movie,
    id: '1730',
    imdbId: undefined,
    title: "Pan's Labyrinth",
    year: '2006',
    source,
  };
  const decoded = "https://www.dvdsreleasedates.com/movies/1730/Pan's-Labyrinth-(2006).html";
  const { parseDetail, fetchSource, parseListing, parseSearchResults } =
    await import('../lib/sources');
  const html = `<link rel='canonical' href="${source}"><h1>Pan's Labyrinth (2006)</h1><a itemprop='sameAs' href='https://www.imdb.com/title/tt0457430/'>IMDb</a>${padding}`;
  globalThis.fetch = async (url) => {
    assert.equal(String(url), decoded);
    return new Response(html);
  };
  try {
    const repaired = parseDetail(await fetchSource(source), native);
    assert.equal(repaired.id, native.id);
    assert.equal(repaired.imdbId, 'tt0457430');
    assert.equal(repaired.source, decoded);
    assert.equal(parseDetail(html.replace(' (2006)', ''), native).imdbId, 'tt0457430');
    assert.equal(parseSearchResults(html.replace(' (2006)', ''))[0].imdbId, 'tt0457430');
    const listing = parseListing(
      `<td class='dvdcell'><a href='/movies/1730/Pan&#039;s-Labyrinth-(2006).html'><img src='/posters/110/pans-labyrinth-2006.jpg' alt='Pan&#039;s Labyrinth (2006) DVD Release Date'></a></td>`,
      false,
    );
    assert.equal(listing[0].source, decoded);
  } finally {
    globalThis.fetch = original;
  }
});
