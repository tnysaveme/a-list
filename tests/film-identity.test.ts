import test from 'node:test';
import assert from 'node:assert/strict';
import { filmIndex, titleKey, verifiedIdentityId } from '../lib/film-identity';
import { mergeSearchProviders } from '../lib/metadata';
import { makeCalendar } from '../lib/calendar';
import { canonicalSearchMovie } from '../lib/search-canonical';
import { sanitizeMovie, availableRelease, type Movie, type Release } from '../lib/model';

const checkedAt = '2026-10-24T12:00:00Z';
const movie: Movie = {
  id: '123',
  title: 'The Return',
  year: '2026',
  source: 'https://www.dvdsreleasedates.com/movies/123/the-return',
  poster: '',
  checkedAt,
  releases: [],
};
const linked = { ...movie, imdbId: 'tt1234567', identityVerifiedAt: checkedAt };
const metadata = {
  ...movie,
  id: 'tt1234567',
  imdbId: 'tt1234567',
  source: 'https://www.imdb.com/title/tt1234567/',
};
const release: Release = {
  kind: 'Subscription',
  date: '2026-11-03',
  confidence: 'listed',
  source: 'https://whentostream.com/the-return/',
  sourceName: 'When To Stream',
};

test('candidate normalization preserves word boundaries, sequels and non-Latin titles', () => {
  assert.equal(titleKey('Amélie: The Return'), titleKey('Amelie — The Return'));
  assert.notEqual(titleKey('AB'), titleKey('A B'));
  assert.notEqual(titleKey('Film 2'), titleKey('Film 3'));
  assert.notEqual(titleKey('東京'), titleKey('大阪'));
});

test('only verified stable identities match; missing years, remakes and duplicate candidates cannot link by title', () => {
  const index = filmIndex([metadata]);
  assert.equal(index.resolve(movie).status, 'candidate');
  assert.equal(index.resolve({ ...movie, year: '' }).status, 'unmatched');
  assert.equal(index.resolve({ ...movie, year: '2006' }).status, 'unmatched');
  assert.equal(index.resolve({ ...movie, imdbId: metadata.id }).status, 'candidate');
  assert.equal(index.resolve(linked).status, 'matched');
  assert.equal(index.resolve({ ...linked, imdbId: 'tt7654321' }).status, 'conflict');
  assert.equal(index.resolve({ ...metadata, imdbId: 'tt7654321' }).status, 'conflict');
  assert.equal(
    filmIndex([metadata, { ...metadata, id: 'tt7654321', imdbId: 'tt7654321' }]).resolve(movie)
      .status,
    'ambiguous',
  );
  assert.equal(filmIndex([linked, { ...linked, id: '456' }]).resolve(metadata).status, 'ambiguous');
  assert.equal(verifiedIdentityId({ ...linked, identityVerifiedAt: 'invalid' }), undefined);
});

test('search does not arbitrarily merge duplicate source records with the same IMDb identity', () => {
  const result = mergeSearchProviders([linked, { ...linked, id: '456' }], [metadata]);
  assert.equal(result.length, 3);
  assert.equal(
    mergeSearchProviders([linked], [{ ...metadata, title: 'Alternate international title' }])
      .length,
    1,
  );
});

test('legacy and mismatched reports stay out of cards and calendars until verified', () => {
  for (const film of [
    { ...movie, releases: [release] },
    { ...movie, imdbId: metadata.id, releases: [{ ...release, filmImdbId: metadata.id }] },
    { ...linked, releases: [{ ...release, filmImdbId: 'tt7654321' }] },
  ]) {
    assert.equal(sanitizeMovie(film).releases.length, 0);
    assert.equal(availableRelease(film, '2026-12-01'), undefined);
    assert.doesNotMatch(makeCalendar([film]), /BEGIN:VEVENT/);
  }
  const verified = { ...linked, releases: [{ ...release, filmImdbId: metadata.id }] };
  assert.equal(sanitizeMovie(verified).releases.length, 1);
  assert.match(makeCalendar([verified]), /UID:movie-123-subscription@afterlight/);
});

test('stored search results cannot restore unverified links, overwrite newer checks or change stable saved IDs', () => {
  const unverified = { ...movie, imdbId: metadata.id };
  assert.equal(canonicalSearchMovie(metadata, unverified).id, metadata.id);
  assert.equal(canonicalSearchMovie(metadata, linked).id, movie.id);
  assert.equal(canonicalSearchMovie(metadata, { ...linked, imdbId: 'tt7654321' }).id, metadata.id);
  const incoming = { ...linked, releaseCheckedAt: checkedAt, releases: [] };
  const stored = {
    ...linked,
    identityVerifiedAt: undefined,
    releaseCheckedAt: '2026-10-23T12:00:00Z',
    releases: [release],
  };
  const canonical = canonicalSearchMovie(incoming, stored);
  assert.equal(canonical.identityVerifiedAt, checkedAt);
  assert.deepEqual(canonical.releases, []);
});
