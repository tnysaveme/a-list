import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseDay, validReleaseDate } from '../lib/release-day';
import { availableRelease, calendarRelease, nextRelease, type Movie } from '../lib/model';
import { discoverMovies } from '../lib/catalogue-view';

test('release days use source-market midnight across DST and year boundaries', () => {
  for (const [instant, day] of [
    ['2026-11-03T04:59:59Z', '2026-11-02'],
    ['2026-11-03T05:00:00Z', '2026-11-03'],
    ['2026-07-03T03:59:59Z', '2026-07-02'],
    ['2026-07-03T04:00:00Z', '2026-07-03'],
    ['2027-01-01T04:59:59Z', '2026-12-31'],
  ])
    assert.equal(releaseDay(new Date(instant)), day);
  for (const date of ['2024-02-29', '2026-11-03']) assert.equal(validReleaseDate(date), true);
  for (const date of ['2026-02-29', '2026-04-31', '0000-01-01', '2026-1-01', '', null])
    assert.equal(validReleaseDate(date), false);
});

test('today moves to Available, stays in the calendar, and uncertainty never becomes availability', () => {
  const movie: Movie = {
    id: '1',
    title: 'Today',
    year: '2026',
    poster: '',
    source: '',
    checkedAt: '',
    releases: [
      {
        kind: 'Subscription',
        date: '2026-11-03',
        confidence: 'rumored',
        source: '',
        sourceName: 'Fixture',
      },
      {
        kind: 'Digital',
        date: '2026-11-03',
        confidence: 'listed',
        source: '',
        sourceName: 'Fixture',
      },
    ],
  };
  assert.equal(discoverMovies([movie], 'soon', 'release', '2026-11-02').length, 1);
  assert.equal(discoverMovies([movie], 'soon', 'release', '2026-11-03').length, 0);
  assert.equal(discoverMovies([movie], 'available', 'release', '2026-11-03').length, 1);
  for (const day of ['2026-11-03', '2026-11-04']) {
    assert.equal(calendarRelease(movie, true, day)?.confidence, 'listed');
    assert.equal(nextRelease(movie, day)?.confidence, 'listed');
  }
  assert.equal(
    availableRelease({ ...movie, releases: [movie.releases[0]] }, '2026-11-03'),
    undefined,
  );
  const invalid = { ...movie, releases: [{ ...movie.releases[1], date: '2026-02-30' }] };
  assert.equal(discoverMovies([invalid], 'unknown', 'release', '2026-11-03').length, 1);
});
