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
