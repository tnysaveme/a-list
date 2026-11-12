import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSourceProfile,
  profileFingerprint,
  unchangedProfile,
  type SourceProfile,
} from '../lib/release-profile';
import { automaticEvidence } from '../lib/release-automation';
import { profileReference, reportReference } from '../lib/reviewed-report-identities';
import { parseProfileReports, parseVerifiedReport, text } from '../lib/sources';
import { sameReleaseTitle, releaseSearchTitle } from '../lib/release-evidence';
import type { MetadataEvidence } from '../lib/metadata';

test('profile fields work when WordPress combines credits and dates with line breaks', () => {
  const url = 'https://whentostream.com/a-film-2026/';
  const html = `<link rel="canonical" href="${url}"><article id="post-123"><h1>A Film (2026)</h1><p>Runtime: 91 mins<br>Genre: Documentary<br>Director: A Director<br>Cast: First Actor<br>Second Actor<br>Synopsis: A film about a journey.<br>VOD Release Date: September 8, 2026<br>SVOD Release Date: January 6, 2027 (Paramount+)</p></article>`;
  const ref = profileReference(html, 'A Film', text)!;
  const profile = parseSourceProfile(html, ref);
  assert.deepEqual(profile.cast, ['First Actor', 'Second Actor']);
  assert.equal(profile.facts?.runtime, 91);
  assert.deepEqual(
    parseProfileReports(html, ref).map((r) => r.release.date),
    ['2026-09-08', '2027-01-06'],
  );
  assert.throws(
    () =>
      parseProfileReports(html.replace('</p>', '<br>VOD Release Date: September 9, 2026</p>'), ref),
    /Ambiguous profile release dates/,
  );
});

const fixtures = [
  {
    title: 'EPIC: ELVIS PRESLEY IN CONCERT',
    year: '2025',
    id: '11952',
    url: 'https://whentostream.com/epic-elvis-presley-in-concert-2025/',
    director: 'Bazz Luhrmann',
    cast: 'Elvis Presley',
    runtime: 96,
    theatrical: 'February 20, 2026',
    synopsis:
      'Long-lost footage from Presley’s legendary Vegas residency in the 1970s, woven together with rare 16mm footage from Elvis on Tour.',
    fields:
      '<p>PVOD Release Date: April 7, 202</p><p>SVOD Release Date: June 3, 2026 (Paramount+)</p>',
    imdb: 'tt35003538',
    metadataTitle: 'Epic: Elvis Presley in Concert',
    metadataYear: '2026',
    metadataDirector: 'Baz Luhrmann',
    metadataCast: ['Elvis Presley'],
    metadataRuntime: 98,
    metadataTheatrical: '2026-02-27',
    metadataSynopsis:
      'Long-lost footage from Elvis Presley’s legendary Las Vegas residency in the 1970s, woven together with rare 16mm footage from Elvis on Tour.',
    expected: ['2026-06-03'],
  },
  {
    title: 'Billie Eilish – Hit Me Hard and Soft: The Tour',
    year: '2026',
    id: '21904',
    url: 'https://whentostream.com/billie-eilish-hit-me-hard-and-soft-the-tour-live-in-3d/',
    director: 'James Cameron',
    cast: 'Billie Eilish',
    runtime: 114,
    theatrical: 'May 8, 2026',
    synopsis: 'A concert documentary following a world tour.',
    fields:
      '<p>PVOD Release Date: June 23, 2026</p><p>SVOD Release Date: August 6, 2026 (Paramount+)</p>',
    imdb: 'tt39018643',
    metadataTitle: 'Billie Eilish: Hit Me Hard and Soft',
    metadataYear: '2026',
    metadataDirector: 'James Cameron',
    metadataCast: ['Billie Eilish'],
    metadataRuntime: 114,
    metadataTheatrical: '2026-05-08',
    metadataSynopsis: 'A film documenting concert performances.',
    expected: ['2026-06-23', '2026-08-06'],
  },
  {
    title: 'Cookie Queens',
    year: '2026',
    id: '24695',
    url: 'https://whentostream.com/cookie-queens-2026/',
    director: 'Alysa Nahmias',
    cast: 'N/A',
    runtime: 91,
    theatrical: 'August 7, 2026',
    synopsis: 'A documentary about Girl Scout Cookie season.',
    fields:
      '<p>VOD Release Date: September 8, 2026</p><p>SVOD Release Date: January 6, 2027 (Paramount+)</p>',
    imdb: 'tt38503564',
    metadataTitle: 'Cookie Queens',
    metadataYear: '2026',
    metadataDirector: 'Alysa Nahmias',
    metadataCast: ['Ara', 'Nikki', 'Olive'],
    metadataRuntime: 91,
    metadataTheatrical: '2026-08-07',
    metadataSynopsis: 'Four girls navigate the pressures of selling cookies.',
    expected: ['2026-09-08', '2027-01-06'],
  },
];
for (const f of fixtures)
  test(`sparse-credit regression: ${f.title}`, () => {
    const html = `<link rel="canonical" href="${f.url}"><article id="post-${f.id}"><h1>${f.title} (${f.year})</h1><p>Genre: Documentary, Music</p><p>Runtime: ${f.runtime} mins</p><p>Theater Date: ${f.theatrical}</p><p>Director: ${f.director}</p><p>Cast: ${f.cast}</p><p>Synopsis: ${f.synopsis}</p>${f.fields}</article>`;
    const ref = profileReference(html, f.title, text)!;
    const profile = parseSourceProfile(html, ref);
    const candidate: MetadataEvidence = {
      primaryIdentityVerified: true,
      facts: { runtime: f.metadataRuntime, theatrical: f.metadataTheatrical },
      directors: [f.metadataDirector],
      cast: f.metadataCast,
      movie: {
        id: f.imdb,
        imdbId: f.imdb,
        title: f.metadataTitle,
        year: f.metadataYear,
        source: `https://www.imdb.com/title/${f.imdb}/`,
        poster: '',
        checkedAt: '2026-10-27T00:00:00Z',
        overview: f.metadataSynopsis,
        releases: [],
      },
    };
    assert.equal(automaticEvidence(profile, [candidate]).movie.id, f.imdb);
    for (const bad of [
      { ...candidate, facts: {} },
      { ...candidate, movie: { ...candidate.movie, title: 'A Different Film' } },
      { ...candidate, movie: { ...candidate.movie, year: '1990' } },
    ])
      assert.throws(() => automaticEvidence(profile, [bad]), /insufficient/);
    const mapping = {
      ...ref,
      imdbId: f.imdb,
      method: 'corroborated' as const,
      reviewedAt: candidate.movie.checkedAt,
      evidence: {
        metadata: candidate.movie.source,
        releaseSource: f.url,
        corroboration: 'Independent film facts',
      },
      profileFingerprint: profileFingerprint(profile),
    };
    const reports = parseProfileReports(html, ref).map((r) =>
      parseVerifiedReport(html, r, [mapping])!,
    );
    assert.deepEqual(
      reports.map((r) => r.release.date),
      f.expected,
    );
    assert.ok(reports.every((r) => r.release.filmImdbId === f.imdb));
  });

test('edition titles and current linked profiles keep the original IMDb film instead of treating a restoration year as a new film', () => {
  const title = 'Guillermo del Toro’s Pan’s Labyrinth 20th Anniversary',
    url = 'https://whentostream.com/guillermo-del-toros-pans-labyrinth-20th-anniversary-2026/';
  const article = `<div itemprop="articleBody"><p><a data-type="page" data-id="38789" href="${url}">Pan’s Labyrinth</a> is coming to digital on November 3, 2026.</p></div>`;
  const ref = reportReference(article, "Pan's Labyrinth", text)!;
  const page = `<link rel="canonical" href="${url}"><article id="post-38789"><h1>${title} (2006)</h1><p>Director: Guillermo del Toro</p><p>Cast: Ivana Baquero, Ariadna Gil, Sergi López</p><p>Synopsis: A young girl encounters a mysterious faun.</p><p>VOD Release Date: November 3, 2026</p></article>`;
  const profile = parseSourceProfile(page, ref);
  assert.equal(profile.year, '2006');
  assert.equal(profile.title, title);
  const stored: SourceProfile = { ...profile, year: '2026' };
  assert.ok(
    unchangedProfile(profile, {
      year: stored.year,
      profileFingerprint: profileFingerprint(stored),
    }),
  );
  assert.throws(
    () => parseSourceProfile(page.replace('post-38789', 'post-90000'), ref),
    /identity/,
  );
  assert.equal(sameReleaseTitle('Film 2', 'Film'), false);
  assert.equal(sameReleaseTitle('Film: A Different Story', 'Film'), false);
  assert.equal(releaseSearchTitle(title, false, ['Guillermo del Toro']), 'Pan’s Labyrinth');
  assert.equal(
    releaseSearchTitle('Ferris Bueller’s Day Off 40th Anniversary', false, ['John Hughes']),
    'Ferris Bueller’s Day Off',
  );
});
