import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseDetail, parseSearchResults } from '../lib/sources';
import { verifiedReleases, type Movie } from '../lib/model';
import { expansionMovie } from '../lib/release-automation';
import { makeCalendar } from '../lib/calendar';
test('captured TV Mini-Series markup is an excluded native subject, never a movie or calendar release', async () => {
  const html = await readFile(
    new URL('./fixtures/primary/night-manager-mini-series.html', import.meta.url),
    'utf8',
  );
  const movie: Movie = {
    id: '8078',
    title: 'The Night Manager',
    year: '2016',
    poster: '',
    source: 'https://www.dvdsreleasedates.com/movies/8078/the-night-manager',
    checkedAt: '2026-11-13T00:00:00Z',
    releases: [
      {
        kind: 'Digital',
        date: '2099-11-01',
        confidence: 'listed',
        source: 'https://www.dvdsreleasedates.com/movies/8078/the-night-manager',
        sourceName: 'DVDs Release Dates',
      },
    ],
  };
  const series = parseDetail(html, movie);
  assert.equal(series.mediaType, 'series');
  assert.deepEqual(series.releases, []);
  assert.deepEqual(parseSearchResults(html), []);
  assert.deepEqual(verifiedReleases({ ...series, releases: movie.releases }), []);
  assert.doesNotMatch(makeCalendar([{ ...series, releases: movie.releases }]), /BEGIN:VEVENT/);
  assert.throws(() => parseDetail(html, { ...movie, title: 'Another Film' }), /identity/);
  assert.throws(
    () => expansionMovie({ ...series, id: 'tt1399664', imdbId: 'tt1399664' }, []),
    /not_movie/,
  );
});
