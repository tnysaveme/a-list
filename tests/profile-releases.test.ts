import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseProfileReports,
  parseReportProfiles,
  parseVerifiedReport,
  text,
} from '../lib/sources';
import { profileReference } from '../lib/reviewed-report-identities';
import { parseSourceProfile, profileFingerprint } from '../lib/release-profile';
import { automaticEvidence, inferredIdentity, expansionMovie } from '../lib/release-automation';
import { refreshMovie } from '../lib/movie-refresh';
import { makeCalendar } from '../lib/calendar';
import type { Movie } from '../lib/model';

const source = 'https://whentostream.com/the-lost-ones-2026/';
const movie: Movie = {
  id: 'tt37028623',
  imdbId: 'tt37028623',
  title: 'The Lost Ones',
  year: '2026',
  poster: '',
  source: 'https://www.imdb.com/title/tt37028623/',
  checkedAt: '2026-10-26T00:00:00Z',
  overview: 'A family starts again.',
  releases: [],
};
const fields =
  '<p><strong>VOD Release Date</strong>: October 27, 2026</p><p>PVOD Release Date: TBA</p><p>SVOD Release Date: November 20, 2026 (Netflix)</p>';
const page = (dates = fields) =>
  `<link rel="canonical" href="${source}"><article id="post-36756"><h1>The Lost Ones (2026)</h1><p>Director: Andrew Baird</p><p>Cast: Henry Golding, Laura Haddock, Alex Pettyfer</p><p>Synopsis: A family starts again.</p><p>Theater Date: September 1, 2026</p>${dates}</article><!--${'.'.repeat(600)}-->`;
const reference = profileReference(page(), movie.title, text)!;
const profile = parseSourceProfile(page(), reference);
const evidence = {
  movie,
  directors: ['Andrew Baird'],
  cast: ['Henry Golding', 'Laura Haddock', 'Alex Pettyfer'],
};
const identity = inferredIdentity(
  profile,
  automaticEvidence(profile, [evidence]),
  'corroborated',
  movie.checkedAt,
  profileFingerprint(profile),
);

test('profile discovery ranks title matches by year without excluding year drift, with safe bounded URLs', () => {
  const item = (title: string, url: string) =>
    `<item><title>${title}</title><link>${url}</link></item>`;
  const xml =
    item('The Lost Ones (2026)', source) +
    item('The Lost Ones (2026)', source) +
    item('The Lost Ones (2016)', source) +
    item('Another Film (2026)', source) +
    item('The Lost Ones (2026)', 'https://other.example/film/') +
    item('The Lost Ones (2026)', `${source}?other=film`) +
    item('The Lost Ones (2026)', 'https://person@whentostream.com/film/');
  assert.deepEqual(parseReportProfiles(xml, movie), [
    { title: movie.title, year: movie.year, source },
  ]);
  assert.deepEqual(parseReportProfiles(item('The Lost Ones (2025)', source), movie), [
    { title: movie.title, year: '2025', source },
  ]);
  assert.equal(
    parseReportProfiles(
      Array.from({ length: 5 }, (_, i) =>
        item('The Lost Ones (2026)', `https://whentostream.com/film-${i}/`),
      ).join(''),
      movie,
    ).length,
    2,
  );
});

test('native profiles read VOD, PVOD and SVOD dates independently, preserving estimates and ignoring theater and TBA dates', () => {
  const reports = parseProfileReports(page(), reference);
  assert.deepEqual(
    reports.map((r) => [r.release.kind, r.release.date, r.release.platform]),
    [
      ['Digital', '2026-10-27', undefined],
      ['Subscription', '2026-11-20', 'Netflix'],
    ],
  );
  const pvod = parseProfileReports(
    page(
      '<p>VOD Release Date: TBA</p><p>PVOD Release Date: expected October 27, 2026</p><p>SVOD Release Date: TBD</p>',
    ),
    reference,
  );
  assert.equal(pvod.length, 1);
  assert.equal(pvod[0].release.kind, 'PVOD');
  assert.equal(pvod[0].release.confidence, 'rumored');
  assert.deepEqual(
    parseProfileReports(
      page(
        '<p>VOD Release Date: February 30, 2026</p><p>SVOD Release Date: withdrawn November 20, 2026</p>',
      ),
      reference,
    ),
    [],
  );
  assert.deepEqual(
    parseProfileReports(
      page('<p>VOD Release Date: TBA</p>') + '<p>VOD Release Date: December 1, 2026</p>',
      reference,
    ),
    [],
  );
  assert.throws(
    () =>
      parseProfileReports(page(fields + '<p>VOD Release Date: November 1, 2026</p>'), reference),
    /Ambiguous/,
  );
  assert.throws(
    () => parseProfileReports(page().replace('post-36756', 'post-1'), reference),
    /identity/,
  );
});

test('profile dates require corroborated identity and cannot bind another film or another source URL', () => {
  const reports = parseProfileReports(page(), reference);
  assert.equal(parseVerifiedReport(page(), reports[0], []), null);
  assert.equal(
    parseVerifiedReport(page(), { ...reports[0], imdbId: 'tt1111111' }, [identity]),
    null,
  );
  assert.equal(
    parseVerifiedReport(
      page(),
      {
        ...reports[0],
        release: { ...reports[0].release, source: 'https://whentostream.com/other-profile/' },
      },
      [identity],
    ),
    null,
  );
  const verified = reports.map((r) => parseVerifiedReport(page(), r, [identity])!);
  assert.ok(
    verified.every(
      (r) => r.release.filmImdbId === movie.id && r.release.filmIdentityMethod === 'corroborated',
    ),
  );
  assert.throws(
    () => automaticEvidence(profile, [{ ...evidence, directors: ['Another Director'] }]),
    /insufficient/,
  );
  assert.throws(
    () => automaticEvidence(profile, [{ ...evidence, cast: ['Henry Golding'] }]),
    /insufficient/,
  );
  const imported = expansionMovie(
    movie,
    verified.map((r) => r.release),
    movie,
  );
  assert.equal((makeCalendar([imported]).match(/BEGIN:VEVENT/g) || []).length, 2);
});

test('profile-backed refresh reads one page for both windows, updates dates with stable UIDs, and removes only explicit TBA windows', async () => {
  const original = globalThis.fetch;
  const releases = parseProfileReports(page(), reference).map(
    (r) => parseVerifiedReport(page(), r, [identity])!.release,
  );
  const saved = {
    ...movie,
    id: '123',
    source: 'https://www.dvdsreleasedates.com/movies/123/the-lost-ones',
    identityVerifiedAt: movie.checkedAt,
    releases,
  };
  let profileRequests = 0;
  let dates = fields.replace('October 27, 2026', 'October 30, 2026');
  globalThis.fetch = async (url) => {
    if (String(url) === source) {
      profileRequests++;
      return new Response(page(dates));
    }
    assert.equal(String(url), saved.source);
    return new Response(
      `<h1>The Lost Ones (2026)</h1><link rel="canonical" href="${saved.source}"><a itemprop="sameAs" href="${movie.source}">IMDb</a><!--${'.'.repeat(600)}-->`,
    );
  };
  try {
    const updated = await refreshMovie(saved, { identities: [identity] });
    assert.equal(profileRequests, 1);
    assert.deepEqual(
      updated.releases.map((r) => r.date),
      ['2026-10-30', '2026-11-20'],
    );
    assert.deepEqual(
      makeCalendar([saved]).match(/UID:.+/g),
      makeCalendar([updated]).match(/UID:.+/g),
    );
    dates = '<p>VOD Release Date: October 30, 2026</p><p>SVOD Release Date: TBA</p>';
    const withdrawn = await refreshMovie(updated, { identities: [identity] });
    assert.equal(withdrawn.releases.length, 1);
    assert.equal(withdrawn.releases[0].kind, 'Digital');
  } finally {
    globalThis.fetch = original;
  }
});

test('temporary profile markup failures preserve last-good windows and calendar UIDs', async () => {
  const original = globalThis.fetch;
  const releases = parseProfileReports(page(), reference).map(
    (r) => parseVerifiedReport(page(), r, [identity])!.release,
  );
  const saved = {
    ...movie,
    id: '123',
    source: 'https://www.dvdsreleasedates.com/movies/123/the-lost-ones',
    identityVerifiedAt: movie.checkedAt,
    releaseCheckedAt: movie.checkedAt,
    releases,
  };
  try {
    for (const broken of [
      '<h1>Verify your browser</h1>' + '.'.repeat(600),
      page('<p>Release details temporarily unavailable.</p>'),
      page().replace('<p>Synopsis: A family starts again.</p>', ''),
      page().replace(`<link rel="canonical" href="${source}">`, ''),
    ]) {
      globalThis.fetch = async (url) =>
        new Response(
          String(url) === source
            ? broken
            : `<h1>The Lost Ones (2026)</h1><link rel="canonical" href="${saved.source}"><a itemprop="sameAs" href="${movie.source}">IMDb</a><!--${'.'.repeat(600)}-->`,
        );
      const refreshed = await refreshMovie(saved, { identities: [identity] });
      assert.deepEqual(refreshed.releases, releases);
      assert.equal(refreshed.releaseCheck?.status, 'partial');
      assert.equal(refreshed.releaseCheckedAt, movie.checkedAt);
      assert.deepEqual(
        makeCalendar([saved]).match(/UID:.+/g),
        makeCalendar([refreshed]).match(/UID:.+/g),
      );
    }
  } finally {
    globalThis.fetch = original;
  }
});

test('partial profile publication preserves missing windows and applies only explicit withdrawals', () => {
  const old = parseProfileReports(page(), reference).map(
    (r) => parseVerifiedReport(page(), r, [identity])!.release,
  );
  const saved = { ...movie, releases: old };
  const partial = page('<p>VOD Release Date: November 10, 2026</p>');
  const fresh = parseProfileReports(partial, reference).map(
    (r) => parseVerifiedReport(partial, r, [identity])!.release,
  );
  const updated = expansionMovie(movie, fresh, saved);
  assert.equal(updated.releases.find((r) => r.kind === 'Subscription')?.date, '2026-11-20');
  const withdrawn = expansionMovie(movie, fresh, saved, [{ source, kind: 'Subscription' }]);
  assert.equal(
    withdrawn.releases.some((r) => r.kind === 'Subscription'),
    false,
  );
});

test('postponement with a replacement updates the date while indefinite postponement withdraws it', () => {
  const moved = page(
    '<p>VOD Release Date: postponed from October 27, 2026 to November 10, 2026</p>',
  );
  assert.equal(parseProfileReports(moved, reference, 'Digital')[0].release.date, '2026-11-10');
  assert.deepEqual(
    parseProfileReports(
      page('<p>VOD Release Date: postponed indefinitely</p>'),
      reference,
      'Digital',
    ),
    [],
  );
  assert.throws(
    () =>
      parseProfileReports(
        page('<p>VOD Release Date: October 27, 2026 or November 10, 2026</p>'),
        reference,
        'Digital',
      ),
    /format/,
  );
});
