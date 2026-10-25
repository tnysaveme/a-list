import test from 'node:test';
import assert from 'node:assert/strict';
import { reportReference, reviewedReportIdentities } from '../lib/reviewed-report-identities';
import { parseReports, parseVerifiedReport, text, type ReleaseReport } from '../lib/sources';

const mapping = reviewedReportIdentities[0];
const report: ReleaseReport = {
  title: mapping.title.toUpperCase(),
  release: {
    kind: 'Digital',
    date: '2026-11-01',
    confidence: 'listed',
    source:
      'https://whentostream.com/action-western-the-isolate-thief-gets-mgm-streaming-premiere-date/',
    sourceName: 'When To Stream',
  },
};
const article =
  () => `<div itemprop='articleBody'><p>The western <a href="${mapping.sourceFilmUrl}" data-type="page" data-id="${mapping.sourceFilmId}">${report.title}</a> is arriving on MGM+ on November 1st, 2026.</p>
 <div data-jw-widget data-object-type="movie" data-title="${mapping.title}" data-year="${mapping.year}"></div></div>`;

test('reviewed crosswalks require distinct source IDs and independent audit evidence', () => {
  assert.equal(
    new Set(reviewedReportIdentities.map((mapping) => mapping.sourceFilmId)).size,
    reviewedReportIdentities.length,
  );
  for (const record of reviewedReportIdentities) {
    assert.match(record.imdbId, /^tt\d{7,10}$/);
    assert.match(record.sourceFilmId, /^\d+$/);
    assert.ok(Number.isFinite(Date.parse(record.reviewedAt)));
    assert.match(record.evidence.metadata, new RegExp(`${record.imdbId}\\.json$`));
    assert.equal(new URL(record.evidence.releaseSource).hostname, 'www.dvdsreleasedates.com');
    assert.ok(record.evidence.corroboration.length > 80);
  }
});

test('reviewed native film references establish an audited IMDb identity and retain subscription windows', () => {
  const verified = parseVerifiedReport(article(), report)!;
  assert.equal(verified.imdbId, mapping.imdbId);
  assert.equal(verified.year, mapping.year);
  assert.equal(verified.release.filmIdentityMethod, 'reviewed');
  assert.equal(verified.release.filmIdentitySource, mapping.sourceFilmUrl);
  assert.equal(verified.release.kind, 'Subscription');
  assert.equal(verified.release.platform, 'MGM+');
});

test('title/year, incidental links, changed IDs, different URLs and remakes never substitute for a reviewed native reference', () => {
  for (const html of [
    article().replace(`data-id="${mapping.sourceFilmId}"`, 'data-id="99999"'),
    article().replace(mapping.sourceFilmUrl, 'https://whentostream.com/a-different-film-2026/'),
    article().replace(
      mapping.sourceFilmUrl,
      mapping.sourceFilmUrl.replace('whentostream.com', 'whentostream.com.evil.test'),
    ),
    article().replace('data-type="page"', 'data-type="post"'),
    article().replace('data-year="2026"', 'data-year="2006"'),
    article().replace('data-object-type="movie"', 'data-object-type="show"'),
    article().replace('data-title="The Isolate Thief"', 'data-title="A Different Film"'),
    article().replace(
      '</p>',
      `<a href="${mapping.sourceFilmUrl}" data-type="page" data-id="${mapping.sourceFilmId}">${report.title}</a></p>`,
    ),
    article().replace(/<a\b[^>]*>([\s\S]*?)<\/a>/, '$1'),
  ])
    assert.equal(parseVerifiedReport(html, report), null);
  assert.equal(parseVerifiedReport(article(), { ...report, title: 'An Unreviewed Film' }), null);
  assert.equal(
    parseVerifiedReport(article(), {
      ...report,
      release: { ...report.release, source: 'https://another.example/report/' },
    }),
    null,
  );
});

test('reviewed mappings cannot override conflicting structured identities', () => {
  const schema = (id: string) => ({
    '@type': 'Movie',
    name: mapping.title,
    sameAs: `https://www.imdb.com/title/${id}/`,
  });
  const add = (data: unknown) =>
    article() + `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
  assert.equal(parseVerifiedReport(add(schema('tt9999999')), report), null);
  assert.equal(
    parseVerifiedReport(add([schema(mapping.imdbId), schema('tt9999999')]), report),
    null,
  );
  assert.equal(parseVerifiedReport(add(schema(mapping.imdbId)), report)?.imdbId, mapping.imdbId);
});

test('an absent optional widget does not replace the requirement for a reviewed exact native ID and URL', () => {
  const nativeOnly = article().replace(/<div data-jw-widget[^>]*><\/div>/, '');
  assert.equal(reportReference(nativeOnly, report.title, text)?.sourceFilmId, mapping.sourceFilmId);
  assert.equal(parseVerifiedReport(nativeOnly, report)?.imdbId, mapping.imdbId);
  assert.equal(parseVerifiedReport(nativeOnly, report, []), null);
  assert.equal(
    parseVerifiedReport(
      nativeOnly.replace(`data-id="${mapping.sourceFilmId}"`, 'data-id="99999"'),
      report,
    ),
    null,
  );
  assert.equal(parseVerifiedReport(article() + article(), report), null);
});

test('MGM+ reports stay subscription releases and unknown SVOD services are withheld', () => {
  const feed = (platform: string) =>
    `<item><title>THE ISOLATE THIEF Gets Streaming Premiere Date</title><link>${report.release.source}</link><description>SVOD debut, arriving on ${platform} on November 1st, 2026.</description></item>`;
  assert.equal(parseReports(feed('MGM+'))[0].release.kind, 'Subscription');
  assert.equal(parseReports(feed('Apple TV'))[0].release.platform, 'Apple TV');
  assert.deepEqual(parseReports(feed('Unrecognised Service')), []);
});
