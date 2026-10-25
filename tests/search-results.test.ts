import test from 'node:test';
import assert from 'node:assert/strict';
import { searchMatches, searchReleaseSummary } from '../lib/search-results';
import { parseDetail } from '../lib/sources';
import type { Movie } from '../lib/model';
const stale: Movie = {
  id: '12409',
  title: 'The Devil Wears Prada 2',
  year: '2026',
  poster: '',
  source: 'https://www.dvdsreleasedates.com/movies/12409/the-devil-wears-prada-2',
  theatrical: '2026-05-01',
  checkedAt: '2026-10-23T12:00:00Z',
  releases: [],
};
const fresh = parseDetail(
  '<h2>The Devil Wears Prada 2 DVD and Blu-ray release date was set for July 28, 2026 and available on Digital HD from Amazon Video and iTunes on June 30, 2026.</h2>',
  stale,
  '2026-10-23T20:50:00Z',
);
test('fresh Prada search result replaces the stale catalogue entry without losing search ranking', () => {
  const other = { ...stale, id: '2379', title: 'The Devil Wears Prada' };
  const found = searchMatches([stale], [fresh, other], 'prada', '2026-10-23');
  assert.deepEqual(
    found.map((m) => m.id),
    ['12409', '2379'],
  );
  assert.equal(found[0].releases[0].date, '2026-06-30');
  assert.equal(
    searchReleaseSummary(found[0], '2026-10-23'),
    'Digital rental/purchase · Available since Jun 30, 2026',
  );
});
test('a newer search response can withdraw a date; merging does not resurrect stale releases', () => {
  const found = searchMatches([fresh], [stale], 'prada', '2026-10-23');
  assert.equal(found.length, 1);
  assert.equal(found[0].releases.length, 0);
  assert.equal(searchReleaseSummary(found[0], '2026-10-23'), 'Home release date not listed');
});
test('search labels distinguish subscription, future dates, and unconfirmed reports', () => {
  const subscription = {
    ...fresh,
    releases: [
      {
        ...fresh.releases[0],
        kind: 'Subscription' as const,
        date: '2026-07-29',
        platform: 'Disney+ / Hulu',
      },
    ],
  };
  assert.equal(
    searchReleaseSummary(subscription, '2026-10-23'),
    'Disney+ / Hulu · Available since Jul 29, 2026',
  );
  assert.equal(searchReleaseSummary(subscription, '2026-07-01'), 'Disney+ / Hulu · Jul 29, 2026');
  const rumor = { ...fresh, releases: [{ ...fresh.releases[0], confidence: 'rumored' as const }] };
  assert.equal(
    searchReleaseSummary(rumor, '2026-10-23'),
    'Digital rental/purchase · Reported Jun 30, 2026',
  );
  assert.doesNotMatch(searchReleaseSummary(rumor, '2026-10-23'), /Available/);
});

test('identified series cannot re-enter movie search through catalogue fallback, remote results or empty-query suggestions', () => {
  const series: Movie = { ...stale, id: '44', mediaType: 'series', theatrical: '2099-01-01' };
  assert.deepEqual(
    searchMatches([series, stale], [series, fresh], 'prada', '2026-10-25').map((movie) => movie.id),
    [fresh.id],
  );
  assert.deepEqual(searchMatches([series], [], '', '2026-10-25'), []);
  assert.deepEqual(
    searchMatches([stale], [], 'prada', '2026-10-25').map((movie) => movie.id),
    [stale.id],
  );
});
