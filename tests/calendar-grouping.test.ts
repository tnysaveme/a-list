import test from 'node:test';
import assert from 'node:assert/strict';
import { CALENDAR_FORMAT_UPDATED_AT, makeCalendar } from '../lib/calendar';
import { feedDocument } from '../lib/feed-cache';
import { calendarReleaseGroups, type Movie, type Release } from '../lib/model';

const film: Movie = {
  id: '123',
  imdbId: 'tt1234567',
  identityVerifiedAt: '2026-10-23T12:00:00.000Z',
  title: 'A film',
  year: '2026',
  poster: '',
  source: 'https://www.dvdsreleasedates.com/movies/123/a-film',
  checkedAt: '2026-10-23T12:00:00.000Z',
  releases: [
    {
      kind: 'Digital',
      date: '2026-11-03',
      confidence: 'listed',
      source: 'https://www.dvdsreleasedates.com/movies/123/a-film',
      sourceName: 'DVDs Release Dates',
    },
    {
      kind: 'PVOD',
      date: '2026-11-03',
      confidence: 'listed',
      source: 'https://whentostream.com/a-film-pvod/',
      sourceName: 'When To Stream',
      filmImdbId: 'tt1234567',
    },
    {
      kind: 'Subscription',
      date: '2026-11-03',
      confidence: 'listed',
      platform: 'Netflix',
      source: 'https://whentostream.com/a-film-streaming/',
      sourceName: 'When To Stream',
      filmImdbId: 'tt1234567',
    },
  ],
};
const options = { now: new Date('2026-10-30T12:00:00.000Z') };
const events = (movie: Movie, includeRumors = true) =>
  makeCalendar([movie], { ...options, includeRumors })
    .replace(/\r\n /g, '')
    .split('BEGIN:VEVENT\r\n')
    .slice(1)
    .map((event) => event.split('END:VEVENT')[0]);
const uid = (event: string) => event.match(/^UID:(.+)$/m)?.[1].trim();
const onDate = (movie: Movie, kind: Release['kind'], date: string): Movie => ({
  ...movie,
  releases: movie.releases.map((r) => (r.kind === kind ? { ...r, date } : r)),
});

test('same-day home releases share one event and alarm while retaining all release evidence', () => {
  const before = structuredClone(film);
  const [event, ...extra] = events(film);
  assert.equal(extra.length, 0);
  assert.equal(uid(event), 'movie-123-digital@afterlight');
  assert.match(event, /SUMMARY:A film · Digital \+ PVOD \+ Netflix\r\n/);
  assert.match(event, /DTSTART:20261103T130000Z\r\nDTEND:20261103T133000Z/);
  assert.equal((event.match(/BEGIN:VALARM/g) || []).length, 1);
  assert.match(event, /TRIGGER;RELATED=START:PT0S/);
  assert.match(event, /STATUS:CONFIRMED/);
  for (const release of film.releases) {
    assert.ok(event.includes(`US ${release.kind} release`));
    assert.ok(event.includes(`Source: ${release.sourceName}`));
    assert.ok(event.includes(release.source));
  }
  assert.match(event, /Subscription release on Netflix/);
  assert.deepEqual(film, before);
  assert.deepEqual(
    makeCalendar([{ ...film, releases: [...film.releases].reverse() }], options),
    makeCalendar([film], options),
  );
});

test('different days split and rejoin using the original kind UIDs, including date moves', () => {
  const split = onDate(onDate(film, 'PVOD', '2026-11-10'), 'Subscription', '2026-11-20');
  const separate = events(split);
  assert.deepEqual(separate.map(uid), [
    'movie-123-digital@afterlight',
    'movie-123-pvod@afterlight',
    'movie-123-subscription@afterlight',
  ]);
  assert.match(separate[1], /DTSTART:20261110T130000Z/);
  assert.match(separate[2], /DTSTART:20261120T130000Z/);
  const partialMerge = onDate(split, 'PVOD', '2026-11-03');
  assert.deepEqual(events(partialMerge).map(uid), [uid(separate[0]), uid(separate[2])]);
  const reunited = onDate(partialMerge, 'Subscription', '2026-11-03');
  assert.deepEqual(events(reunited), events(film));
  const moved = { ...film, releases: film.releases.map((r) => ({ ...r, date: '2027-01-01' })) };
  assert.equal(uid(events(moved)[0]), uid(events(film)[0]));
  assert.match(events(moved)[0], /DTSTART:20270101T130000Z/);
  assert.doesNotMatch(events(moved)[0], /20261103T130000Z/);
  // A withdrawal picks another existing UID; it never invents a date-based identity.
  const withoutDigital = { ...film, releases: film.releases.slice(1) };
  assert.equal(uid(events(withoutDigital)[0]), uid(separate[1]));
  assert.equal(uid(events({ ...film, releases: film.releases.slice(2) })[0]), uid(separate[2]));
});

test('rumor-only groups stay tentative, disappear on opt-out and keep their UID on confirmation', () => {
  const rumor: Movie = {
    ...film,
    releases: film.releases.map((r) => ({ ...r, confidence: 'rumored' })),
  };
  const [event] = events(rumor);
  assert.match(event, /SUMMARY:\[Unconfirmed\] A film · Digital \+ PVOD \+ Netflix/);
  assert.match(event, /STATUS:TENTATIVE/);
  assert.equal((event.match(/Unconfirmed date/g) || []).length, 3);
  assert.equal((event.match(/BEGIN:VALARM/g) || []).length, 1);
  assert.deepEqual(events(rumor, false), []);
  assert.doesNotMatch(makeCalendar([rumor], { ...options, includeRumors: false }), /VALARM/);
  assert.equal(uid(event), uid(events(film)[0]));
});

test('mixed-confidence days label uncertain options and filter them before grouping', () => {
  const mixed: Movie = {
    ...film,
    releases: film.releases.map((r) => ({
      ...r,
      confidence: r.kind === 'Subscription' ? 'listed' : 'rumored',
    })),
  };
  const [included] = events(mixed);
  assert.match(
    included,
    /SUMMARY:A film · Digital \[Unconfirmed\] \+ PVOD \[Unconfirmed\] \+ Netflix/,
  );
  assert.match(included, /STATUS:CONFIRMED/);
  assert.equal((included.match(/Unconfirmed date/g) || []).length, 2);
  assert.match(included, /URL:https:\/\/whentostream.com\/a-film-streaming\//);
  const [excluded] = events(mixed, false);
  assert.equal(uid(excluded), 'movie-123-subscription@afterlight');
  assert.match(excluded, /SUMMARY:A film · Netflix\r\n/);
  assert.match(excluded, /STATUS:CONFIRMED/);
  assert.doesNotMatch(excluded, /Digital|PVOD|Unconfirmed|a-film-pvod/);
  const laterRumor = onDate(mixed, 'PVOD', '2026-11-10');
  assert.equal(events(laterRumor).length, 2);
  assert.equal(events(laterRumor, false).length, 1);
});

test('grouping respects verified identity and date validation and never groups different films', () => {
  const broken: Movie = {
    ...film,
    releases: [
      film.releases[0],
      { ...film.releases[1], date: '2026-02-31' },
      { ...film.releases[2], filmImdbId: 'tt7654321' },
      { ...film.releases[0], date: 'not-a-date' },
    ],
  };
  assert.deepEqual(calendarReleaseGroups(broken), [[film.releases[0]]]);
  assert.match(events(broken)[0], /SUMMARY:A film · Digital\r\n/);
  assert.doesNotMatch(events(broken)[0], /Netflix|PVOD|a-film-streaming/);
  assert.deepEqual(events({ ...film, releases: [] }), []);
  const calendar = makeCalendar([film, { ...film, id: '456' }], options);
  assert.equal((calendar.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(calendar, /UID:movie-123-digital@afterlight/);
  assert.match(calendar, /UID:movie-456-digital@afterlight/);
});

test('combined labels and source evidence stay escaped and folded within the calendar byte limit', () => {
  const long: Movie = {
    ...film,
    title: 'Cinema 🎬 '.repeat(30) + '\nBEGIN:VEVENT',
    releases: film.releases.map((r) => ({ ...r, platform: 'Service, with; punctuation\nand 🎬' })),
  };
  const calendar = makeCalendar([long], options);
  assert.equal((calendar.match(/\r\nBEGIN:VEVENT/g) || []).length, 1);
  assert.match(calendar, /\\nBEGIN:VEVENT/);
  assert.ok(calendar.replace(/\r\n /g, '').includes('Service\\, with\\; punctuation\\nand 🎬'));
  for (const line of calendar.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
});

test('format revision advances old calendar content and group changes invalidate the feed ETag', () => {
  const first = makeCalendar([film], options);
  const modified = CALENDAR_FORMAT_UPDATED_AT.replace(/[-:]/g, '').replace(/\.\d{3}Z/, 'Z');
  assert.match(first, new RegExp(`LAST-MODIFIED:${modified}`));
  const document = feedDocument(first, CALENDAR_FORMAT_UPDATED_AT);
  const split = onDate(film, 'Subscription', '2026-11-20');
  assert.notEqual(
    feedDocument(makeCalendar([split], options), CALENDAR_FORMAT_UPDATED_AT).etag,
    document.etag,
  );
  assert.equal(
    feedDocument(makeCalendar([film], options), CALENDAR_FORMAT_UPDATED_AT).etag,
    document.etag,
  );
});
