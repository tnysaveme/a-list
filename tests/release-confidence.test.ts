import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDetail, parseListing, parseSearchResults } from '../lib/sources';
import { mergeMovies, type Movie } from '../lib/model';
import { makeCalendar } from '../lib/calendar';
import { releaseStatusNotice } from '../lib/release-status';

const movie: Movie = {
  id: '123',
  title: 'A Film',
  year: '2026',
  poster: '',
  source: 'https://www.dvdsreleasedates.com/movies/123/a-film',
  checkedAt: '2026-10-25T00:00:00Z',
  releases: [],
};
const native = `<link rel="canonical" href="${movie.source}"><h1>A Film (2026)</h1><a itemprop="sameAs" href="http://www.imdb.com/title/tt1234567/">IMDb</a>`;
test('primary detail estimates stay tentative, including after a later unqualified calendar publication', () => {
  for (const word of ['expected', 'estimated', 'tentative', 'unconfirmed']) {
    const report = parseDetail(
      `<h2>A Film available on Digital HD, ${word} on November 3, 2026.</h2>`,
      movie,
    );
    assert.equal(report.releases[0].confidence, 'rumored');
    const listing = {
      ...movie,
      releases: [
        { ...report.releases[0], confidence: 'listed' as const, evidence: 'listing' as const },
      ],
    };
    assert.equal(mergeMovies([report, listing])[0].releases[0].confidence, 'rumored');
    const confirmed = parseDetail('<h2>Available on Digital HD on November 3, 2026.</h2>', report);
    assert.equal(mergeMovies([report, confirmed])[0].releases[0].confidence, 'listed');
    assert.match(makeCalendar([report]), /STATUS:TENTATIVE/);
    assert.doesNotMatch(makeCalendar([report], { includeRumors: false }), /BEGIN:VEVENT/);
  }
});
test('estimated physical dates do not downgrade explicit digital dates or substitute for missing dates', () => {
  const report = parseDetail(
    '<h2>DVD release estimated for December 1, 2026 and available on Digital HD on November 3, 2026.</h2>',
    movie,
  );
  assert.equal(report.releases[0].confidence, 'listed');
  assert.equal(report.releases[0].date, '2026-11-03');
  assert.equal(
    parseDetail('<h2>Digital HD to be announced; DVD release on December 1, 2026.</h2>', movie)
      .releases.length,
    0,
  );
});
test('a precise postponement changes the release, and a verified withdrawal removes it', () => {
  const previous = parseDetail('<h2>Digital HD on November 3, 2026.</h2>', movie);
  const postponed = parseDetail(
    '<h2>Digital HD previously on November 3, 2026, postponed to November 10, 2026.</h2>',
    previous,
  );
  assert.equal(postponed.releases[0].date, '2026-11-10');
  const withdrawn = parseDetail(
    native + '<h2>Digital HD on November 10, 2026 was withdrawn.</h2>',
    postponed,
  );
  assert.equal(withdrawn.releases.length, 0);
});
test('calendar estimates use the same confidence rules as film detail dates', () => {
  const cell =
    '<td class="dvdcell"><a href="/movies/123/a-film"><img alt="A Film DVD Release Date" src="/posters/110/A/A-Film-2026.jpg"></a></td>';
  const result = parseListing('<td class="reldate">Estimated November 3, 2026</td>' + cell, true);
  assert.equal(result[0].releases[0].confidence, 'rumored');
  assert.equal(
    parseListing('<td class="reldate">November 3, 2026</td>' + cell, true)[0].releases[0]
      .confidence,
    'listed',
  );
});
test('recognized legacy pages provide metadata without withdrawing dates or inventing digital availability', () => {
  const previous = parseDetail('<h2>Digital HD on November 3, 2026.</h2>', movie);
  const legacy = parseDetail(
    native + '<p itemprop="description">A family reconnects.</p>',
    previous,
  );
  assert.equal(legacy.overview, 'A family reconnects.');
  assert.deepEqual(legacy.releases, previous.releases);
  assert.equal(legacy.primaryListingUnavailable, true);
  assert.match(releaseStatusNotice(legacy)!, /previous date/);
  const unknown = parseDetail(native, movie);
  assert.deepEqual(unknown.releases, []);
  assert.throws(() => parseDetail(native.replace('A Film (2026)', 'Another Film (2026)'), movie));
  assert.throws(() => parseDetail(native + '<h2>Verify your browser</h2>', movie));
  const series = native.replace('A Film (2026)', 'A Film (TV Series)');
  assert.equal(parseDetail(series, movie).mediaType, 'series');
  assert.deepEqual(parseSearchResults(series), []);
});
test('partial and stale source checks are visible while saved dates stay intact', () => {
  const dated = parseDetail(
    '<h2>Digital HD on November 3, 2026.</h2>',
    movie,
    '2026-10-24T00:00:00Z',
  );
  assert.match(
    releaseStatusNotice(dated, Date.parse('2026-10-25T00:00:00Z'))!,
    /awaiting a source refresh/,
  );
  assert.match(
    releaseStatusNotice({
      ...dated,
      releaseCheck: { status: 'partial', attemptedAt: '2026-10-25T00:00:00Z', issues: [] },
    })!,
    /last saved dates/,
  );
  assert.equal(dated.releases[0].date, '2026-11-03');
});
