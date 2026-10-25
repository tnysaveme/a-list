import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCalendar } from '../lib/calendar';
import {
  parseListing,
  parseSearchResults,
  parseDetail,
  parseReports,
  parseReportDetail,
  dateFromText,
} from '../lib/sources';
import { mergeMovies, nextRelease, type Movie } from '../lib/model';
const sample: Movie = {
  id: '123',
  title: 'A film, with; punctuation',
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
  ],
};
test('digital listings are associated with their own day and theatrical listings stay separate', () => {
  const html = `<td class='reldate future'>Tuesday November 3, 2026<div>next week</div></td><td class='dvdcell'><a href='/movies/123/a-film'><img alt='A Film DVD Release Date' src='/posters/110/A/A-Film-2026.jpg'/></a></td><td class='reldate future'>Tuesday November 10, 2026</td><td class='dvdcell'><a href='/movies/124/another-film'><img alt='Another Film DVD Release Date' src='/posters/110/A/Another-Film-2026.jpg'/></a></td>`;
  const movies = parseListing(html, true);
  assert.equal(movies.length, 2);
  assert.equal(movies[0].releases[0].date, '2026-11-03');
  assert.equal(movies[1].releases[0].date, '2026-11-10');
  assert.equal(parseListing(html, false)[0].releases.length, 0);
});
test('DVD and Blu-ray dates are never used as digital dates', () => {
  const movie = parseDetail(
    `<link rel="canonical" href="${sample.source}"><h1>${sample.title} (2026)</h1><h2>DVD and Blu-ray release date is set for December 15, 2026.</h2>`,
    sample,
  );
  assert.equal(movie.releases.length, 0);
  const actual = parseDetail(
    '<h2>DVD release December 15, 2026 and available on Digital HD from Amazon and iTunes on <span>November 3, 2026</span>.</h2>',
    sample,
  );
  assert.equal(actual.releases[0].date, '2026-11-03');
});
test('exact-search redirects use the canonical native subject and ignore sidebar recommendations', () => {
  const html = `<link rel="canonical" href="${sample.source}"><h1><span itemprop="name">A Film</span> (2026)</h1><img itemprop="image" src="/posters/300/A/A-Film-2026.jpg"><h2>Available on Digital HD on November 3, 2026.</h2><a itemprop="sameAs" href="http://www.imdb.com/title/tt1234567/">IMDb</a><div id="rightcolumn"><td class="dvdcell"><a href="/movies/999/unrelated"><img alt="Unrelated DVD Release Date" src="/posters/110/U/Unrelated-2026.jpg"></a></td></div>`;
  const results = parseSearchResults(html);
  assert.equal(results.length, 1);
  assert.equal(results[0].id, '123');
  assert.equal(results[0].title, 'A Film');
  assert.equal(results[0].imdbId, 'tt1234567');
  assert.ok(results[0].identityVerifiedAt);
  assert.equal(results[0].releases[0].date, '2026-11-03');
  assert.equal(parseSearchResults(html.replace('(2026)</h1>', '( 2026 )</h1>'))[0].id, '123');
  assert.throws(
    () =>
      parseSearchResults(
        html.replace('www.dvdsreleasedates.com/movies/123', 'evil.example/movies/123'),
      ),
    /identity mismatch/,
  );
  assert.deepEqual(
    parseSearchResults('<div>No results found</div><div id="rightcolumn">' + html + '</div>'),
    [],
  );
  assert.throws(
    () => parseSearchResults('<html>A challenge or unrecognized provider response</html>'),
    /format changed/,
  );
});
test('rumor reporting is retained as tentative, never promoted to a confirmed listing', () => {
  const reports = parseReports(
    `<item><title>THAT FILM Digital Streaming Release Date Revealed</title><link>https://whentostream.com/that-film/</link><description><![CDATA[According to our sources, expected on November 3rd, 2026. Neither announced nor confirmed.]]></description></item>`,
  );
  assert.equal(reports[0].release.confidence, 'rumored');
  assert.equal(reports[0].release.date, '2026-11-03');
});
test('invalid dates fail safely', () => {
  assert.equal(dateFromText('February 31, 2026'), null);
  assert.equal(dateFromText('January 99, 2026'), null);
  assert.equal(dateFromText('coming soon'), null);
});
test('service-original platform announcements retain subscription classification in discovery and revalidation', () => {
  const copy =
    'Netflix has released the trailer for AVEDON, which will launch on their platform on November 11th, 2026.';
  const feed = `<item><title>AVEDON Gets Official Trailer</title><link>https://whentostream.com/avedon-trailer/</link><description>${copy}</description></item>`;
  const release = parseReports(feed)[0].release;
  assert.equal(release.kind, 'Subscription');
  assert.equal(release.platform, 'Netflix');
  const rechecked = parseReportDetail(`<div itemprop="articleBody"><p>${copy}</p></div>`, {
    ...release,
    kind: 'Digital',
    platform: undefined,
  });
  assert.equal(rechecked?.kind, 'Subscription');
  assert.equal(rechecked?.platform, 'Netflix');
  assert.deepEqual(
    parseReports(
      feed.replaceAll('Netflix has released', 'A distributor mentions Netflix and has released'),
    ),
    [],
  );
});
test('trailer cinema and physical release dates cannot become home-release events', () => {
  for (const copy of [
    'Searchlight Pictures has unveiled the trailer for WILD HORSE NINE, which will launch in US theaters on November 6th, 2026.',
    'WILD HORSE NINE gets a Blu-ray release on November 6th, 2026.',
  ]) {
    const feed = `<item><title>WILD HORSE NINE Gets First Trailer</title><link>https://whentostream.com/wild-horse-nine-trailer/</link><description>${copy}</description></item>`;
    assert.deepEqual(parseReports(feed), []);
    assert.equal(
      parseReportDetail(
        `<h1>WILD HORSE NINE Digital Streaming Release Date</h1><div itemprop="articleBody"><p>${copy}</p></div>`,
        sample.releases[0],
      ),
      null,
    );
  }
});
test('reports select the home-release date when cinema and digital dates share an opening paragraph', () => {
  for (const copy of [
    'The film opens in US theaters on April 30th, 2026 and launches on VOD and digital platforms on June 5th, 2026.',
    'The film launches on VOD and digital platforms on June 5th, 2026. It opens in US theaters on April 30th, 2026.',
  ]) {
    const feed = `<item><title>SEVEN SNIPERS Gets Official Trailer Digital Streaming Release Date</title><link>https://whentostream.com/seven-snipers-digital/</link><description>${copy}</description></item>`;
    assert.equal(parseReports(feed)[0].release.date, '2026-06-05');
    assert.equal(
      parseReportDetail(`<div itemprop="articleBody"><p>${copy}</p></div>`, {
        ...sample.releases[0],
        source: 'https://whentostream.com/seven-snipers-digital/',
      })?.date,
      '2026-06-05',
    );
  }
});
test('a streaming-original teaser keeps the named service and its platform launch date', () => {
  const copy =
    'Netflix has unveiled the first teaser trailer and poster for their upcoming thriller APEX, which will begin streaming on their platform on April 24th, 2026.';
  const feed = `<item><title>APEX Gets Teaser Trailer</title><link>https://whentostream.com/apex-trailer/</link><description>${copy}</description></item>`;
  const report = parseReports(feed)[0];
  assert.equal(report.release.kind, 'Subscription');
  assert.equal(report.release.platform, 'Netflix');
  assert.equal(
    parseReportDetail(`<div itemprop="articleBody"><p>${copy}</p></div>`, {
      ...report.release,
      kind: 'Digital',
      platform: undefined,
    })?.kind,
    'Subscription',
  );
});
test('a studio announcement streaming on Prime Video is a subscription release, excluding its earlier cinema date', () => {
  const copy =
    'Amazon MGM Studios has released the trailer for MADDEN, which will begin streaming on Prime Video on November 18th, 2026. The film will have a limited theatrical release on November 11th, 2026.';
  const feed = `<item><title>MADDEN Gets Official Trailer</title><link>https://whentostream.com/madden-trailer/</link><description>${copy}</description></item>`;
  const release = parseReports(feed)[0].release;
  assert.equal(release.kind, 'Subscription');
  assert.equal(release.platform, 'Prime Video');
  assert.equal(release.date, '2026-11-18');
  const checked = parseReportDetail(`<div itemprop="articleBody"><p>${copy}</p></div>`, {
    ...release,
    kind: 'Digital',
    platform: undefined,
  });
  assert.equal(checked?.kind, 'Subscription');
  assert.equal(checked?.platform, 'Prime Video');
  assert.equal(checked?.date, '2026-11-18');
});
test('merging theatre and digital listings preserves sourced digital releases', () => {
  const merged = mergeMovies([sample, { ...sample, theatrical: '2026-09-01', releases: [] }]);
  assert.equal(merged[0].releases.length, 1);
});
test('calendar includes reported dates by default, labels them tentative, and preserves opt-out', () => {
  const rumor = {
    ...sample,
    releases: sample.releases.map((r) => ({ ...r, confidence: 'rumored' as const })),
  };
  const tentative = makeCalendar([rumor]).replace(/\r\n /g, '');
  assert.match(tentative, /STATUS:TENTATIVE/);
  assert.match(tentative, /SUMMARY:\[Rumored\]/);
  assert.match(tentative, /Reported\\; not confirmed\./);
  assert.doesNotMatch(makeCalendar([rumor], { includeRumors: false }), /BEGIN:VEVENT|VALARM/);
  const confirmed = makeCalendar([sample]);
  assert.match(confirmed, /STATUS:CONFIRMED/);
  assert.equal(tentative.match(/UID:.+/)?.[0], confirmed.match(/UID:.+/)?.[0]);
});
test('stable IDs survive date changes; all-day end is exclusive across year boundaries', () => {
  const changed = {
    ...sample,
    releases: sample.releases.map((r) => ({ ...r, date: '2026-12-31' })),
  };
  const a = makeCalendar([sample]);
  const b = makeCalendar([changed]);
  assert.equal(a.match(/UID:.+/)?.[0], b.match(/UID:.+/)?.[0]);
  assert.match(b, /DTEND;VALUE=DATE:20270101/);
  assert.match(a, /SUMMARY:A film\\, with\\; punctuation/);
});
test('calendar content is escaped and UTF-8 lines are folded at 75 bytes', () => {
  const long = { ...sample, title: 'Cinema 🎬 '.repeat(30) + '\nBEGIN:VEVENT' };
  const calendar = makeCalendar([long]);
  assert.equal((calendar.match(/\r\nBEGIN:VEVENT/g) || []).length, 1);
  for (const line of calendar.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  assert.match(calendar, /\\nBEGIN:VEVENT/);
});
test('unknown films do not create fake events; next release chooses upcoming window', () => {
  assert.doesNotMatch(makeCalendar([{ ...sample, releases: [] }]), /BEGIN:VEVENT/);
  assert.equal(
    nextRelease(
      {
        ...sample,
        releases: [
          ...sample.releases,
          { ...sample.releases[0], kind: 'Subscription', date: '2026-12-01' },
        ],
      },
      '2026-11-15',
    )?.kind,
    'Subscription',
  );
});
test('each dated release gets a display alert at 1pm GMT without changing its all-day date', () => {
  const film = {
    ...sample,
    releases: [
      ...sample.releases,
      { ...sample.releases[0], kind: 'Subscription' as const, date: '2027-07-01' },
    ],
  };
  const calendar = makeCalendar([film]).replace(/\r\n /g, '');
  const events = calendar.split('BEGIN:VEVENT').slice(1);
  assert.equal(events.length, 2);
  for (const [index, event] of events.entries()) {
    const day = film.releases[index].date.replace(/-/g, '');
    assert.match(event, new RegExp(`DTSTART;VALUE=DATE:${day}\\r\\n`));
    assert.match(
      event,
      new RegExp(
        `BEGIN:VALARM\\r\\nACTION:DISPLAY\\r\\nTRIGGER;VALUE=DATE-TIME:${day}T130000Z\\r\\n`,
      ),
    );
    assert.equal((event.match(/BEGIN:VALARM/g) || []).length, 1);
    assert.match(event, /DESCRIPTION:A film\\, with\\; punctuation/);
  }
});
test('an alert follows a changed release date and excluded rumors do not leave orphan alerts', () => {
  const changed = {
    ...sample,
    releases: sample.releases.map((r) => ({ ...r, date: '2027-01-01' })),
  };
  const calendar = makeCalendar([changed]);
  assert.match(calendar, /TRIGGER;VALUE=DATE-TIME:20270101T130000Z/);
  assert.doesNotMatch(calendar, /20261103T130000Z/);
  assert.match(calendar, /DTEND;VALUE=DATE:20270102/);
  const rumor = {
    ...sample,
    releases: sample.releases.map((r) => ({ ...r, confidence: 'rumored' as const })),
  };
  assert.doesNotMatch(makeCalendar([rumor], { includeRumors: false }), /VALARM|TRIGGER/);
  assert.match(makeCalendar([rumor]), /BEGIN:VALARM/);
  assert.doesNotMatch(
    makeCalendar([{ ...sample, releases: [{ ...sample.releases[0], date: '2026-02-31' }] }]),
    /VALARM|VEVENT/,
  );
});

test('accented release-report titles retain the whole subject rather than a suffix after Ñ', () => {
  for (const title of ['FILIPIÑANA', 'FILIPIN\u0303ANA', 'ÉTÉ', 'À BIENTÔT', 'FILIPI&Ntilde;ANA']) {
    const xml = `<item><title>Sundance Prize-Winner ${title} Sets Digital Streaming Release Date</title><link>https://whentostream.com/a-film/</link><description>Arriving on October 27th, 2026.</description></item>`;
    assert.equal(parseReports(xml)[0].title, title.replace('&Ntilde;', 'Ñ'));
    assert.equal(parseReports(xml)[0].release.date, '2026-10-27');
  }
});
