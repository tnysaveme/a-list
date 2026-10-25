import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDetail, parseVerifiedReport, type ReleaseReport } from '../lib/sources';
import { structuredFilmIdentity, listingImdbId } from '../lib/source-identity';
import {
  attachVerifiedReports,
  enrichCatalogueReports,
  verifySearchListings,
} from '../lib/source-verification';
import { mergeSearchProviders } from '../lib/metadata';
import { refreshMovie } from '../lib/movie-refresh';
import type { Movie } from '../lib/model';

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
const imdb = 'tt1234567';
const linked = { ...movie, imdbId: imdb, identityVerifiedAt: checkedAt };
const metadata = {
  ...movie,
  id: imdb,
  imdbId: imdb,
  source: `https://www.imdb.com/title/${imdb}/`,
};
const report: ReleaseReport = {
  title: movie.title,
  release: {
    kind: 'Subscription',
    platform: 'Netflix',
    date: '2026-11-03',
    confidence: 'listed',
    source: 'https://whentostream.com/the-return/',
    sourceName: 'When To Stream',
  },
};
const padding = '<!--' + '.'.repeat(500) + '-->';
const json = (data: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
const subject = (id = imdb) => ({
  '@type': 'Movie',
  name: movie.title,
  sameAs: `https://www.imdb.com/title/${id}/`,
  datePublished: '2026-01-01',
});
const article = (data: unknown = subject()) =>
  json({ '@type': 'NewsArticle', about: data }) +
  '<p itemprop="articleBody">Arriving on Netflix on November 3, 2026.</p>' +
  padding;
const detail = (id = imdb) =>
  `<h2>Digital HD on October 20, 2026.</h2><a href="https://www.imdb.com/title/${id}/" itemprop="sameAs">IMDb</a>` +
  padding;

test('report subject identity requires explicit Movie data; incidental links, other titles and conflicting IDs fail closed', () => {
  assert.equal(structuredFilmIdentity(article(), movie.title).imdbId, imdb);
  assert.equal(parseVerifiedReport(article(), report)?.release.filmImdbId, imdb);
  assert.equal(
    parseVerifiedReport('<p itemprop="articleBody">November 3, 2026.</p>' + detail(), report),
    null,
  );
  assert.equal(
    parseVerifiedReport(article({ ...subject(), name: 'A different film' }), report),
    null,
  );
  assert.equal(parseVerifiedReport(article([subject(), subject('tt7654321')]), report), null);
  assert.equal(
    parseVerifiedReport(
      article({ ...subject(), sameAs: 'https://www.imdb.com.evil.test/title/tt1234567/' }),
      report,
    ),
    null,
  );
  assert.equal(
    parseVerifiedReport(
      article({ ...subject(), sameAs: 'http://www.imdb.com/title/tt1234567/' }),
      report,
    ),
    null,
  );
  assert.equal(parseVerifiedReport(article(), { ...report, imdbId: 'tt7654321' }), null);
  assert.equal(parseVerifiedReport(article(), { ...report, year: '2006' }), null);
  assert.equal(
    structuredFilmIdentity(json({ ...subject(), datePublished: undefined }), movie.title).year,
    undefined,
  );
});

test('release attachment requires matching evidence on both sources and never invents catalogue films', () => {
  const verified = parseVerifiedReport(article(), report)!;
  assert.equal(attachVerifiedReports([movie], [verified]).movies[0].releases.length, 0);
  assert.equal(attachVerifiedReports([linked], [report]).movies[0].releases.length, 0);
  const good = attachVerifiedReports([linked], [verified]);
  assert.equal(good.decisions.matched, 1);
  assert.equal(good.movies[0].releases[0].platform, 'Netflix');
  assert.equal(
    attachVerifiedReports([linked, { ...linked, id: '456' }], [verified]).decisions.ambiguous,
    1,
  );
  assert.equal(
    attachVerifiedReports([{ ...linked, imdbId: 'tt7654321' }], [verified]).decisions.conflict,
    1,
  );
  assert.equal(attachVerifiedReports([], [verified]).movies.length, 0);
  const existing = {
    ...linked,
    releases: [{ ...report.release, sourceName: 'DVDs Release Dates' }],
  };
  assert.equal(
    attachVerifiedReports([existing], [verified]).movies[0].releases[0].sourceName,
    'DVDs Release Dates',
  );
});

test('native source identity conflicts and multiple IMDb links cannot certify a film', () => {
  assert.equal(listingImdbId(detail()), imdb);
  assert.equal(
    listingImdbId(
      detail().replace('https://www.imdb', 'http://www.imdb') +
        '<a href="https://www.imdb.com/title/tt7654321/">Related film</a>',
    ),
    imdb,
  );
  assert.equal(
    listingImdbId('<a href="https://www.imdb.com/title/tt7654321/">Related film only</a>'),
    undefined,
  );
  assert.equal(listingImdbId(detail() + detail('tt7654321')), undefined);
  assert.throws(() => parseDetail(detail('tt7654321'), linked), /identity mismatch/);
  assert.throws(() => parseDetail(detail(), { ...movie, id: '456' }), /identity mismatch/);
  const repaired = parseDetail(detail(), {
    ...movie,
    imdbId: 'tt7654321',
    overview: 'Synopsis from the wrong metadata film.',
  });
  assert.equal(repaired.imdbId, imdb);
  assert.ok(repaired.identityVerifiedAt);
  assert.equal(repaired.overview, undefined);
});

test('search verification merges only the IMDb identity actually found on the native detail page', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(detail());
    const verified = await verifySearchListings([movie], [metadata]);
    assert.equal(verified[0].imdbId, imdb);
    assert.ok(verified[0].identityVerifiedAt);
    assert.equal(mergeSearchProviders(verified, [metadata]).length, 1);
    globalThis.fetch = async () => new Response(detail('tt7654321'));
    assert.equal(
      mergeSearchProviders(await verifySearchListings([movie], [metadata]), [metadata]).length,
      2,
    );
    globalThis.fetch = async () => new Response('Unavailable', { status: 503 });
    assert.deepEqual(await verifySearchListings([movie], [metadata]), [movie]);
  } finally {
    globalThis.fetch = original;
  }
});

test('verification request caps and deduplicated detail lookups bound provider work', async () => {
  const original = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response(detail());
    };
    await verifySearchListings(
      Array.from({ length: 20 }, (_, i) => ({ ...movie, id: String(i + 1) })),
      [metadata],
    );
    assert.equal(calls, 4);
    let reportCalls = 0,
      detailCalls = 0;
    globalThis.fetch = async (url) => {
      if (String(url).includes('whentostream')) {
        reportCalls++;
        return new Response(article());
      }
      detailCalls++;
      return new Response(detail());
    };
    const result = await enrichCatalogueReports(
      [movie],
      Array.from({ length: 10 }, (_, i) => ({
        ...report,
        release: { ...report.release, source: `https://whentostream.com/report-${i}/` },
      })),
    );
    assert.equal(reportCalls, 4);
    assert.equal(detailCalls, 1);
    assert.equal(result.movies.length, 1);
    assert.equal(result.movies[0].releases.length, 1);
    assert.equal(result.decisions.unresolved, 6);
  } finally {
    globalThis.fetch = original;
  }
});

test('report failure leaves native catalogue coverage available and unknown dates unknown', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('Unavailable', { status: 503 });
    const result = await enrichCatalogueReports([movie], [report]);
    assert.deepEqual(result.movies, [movie]);
    assert.equal(result.decisions.unresolved, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test('refresh revalidates legacy reports, drops wrong subjects and preserves verified report evidence', async () => {
  const original = globalThis.fetch;
  const saved = { ...linked, overview: 'A synopsis.', releases: [report.release] };
  try {
    globalThis.fetch = async (url) =>
      new Response(String(url).includes('whentostream') ? article() : detail());
    const result = await refreshMovie(saved);
    assert.equal(result.releases.find((r) => r.sourceName === 'When To Stream')?.filmImdbId, imdb);
    globalThis.fetch = async (url) =>
      new Response(String(url).includes('whentostream') ? article(subject('tt7654321')) : detail());
    assert.equal(
      (await refreshMovie(saved)).releases.some((r) => r.sourceName === 'When To Stream'),
      false,
    );
  } finally {
    globalThis.fetch = original;
  }
});
