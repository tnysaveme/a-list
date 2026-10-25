import test from 'node:test';
import assert from 'node:assert/strict';
import {
  availableRelease,
  displayRelease,
  nextRelease,
  releaseCheckDue,
  type Movie,
} from '../lib/model';
import { digitalListingUrls, loadCatalogue } from '../lib/release-catalogue';
import { refreshMovie } from '../lib/movie-refresh';
import { fetchSource } from '../lib/sources';

const now = new Date('2026-10-24T12:00:00Z');
const coyote: Movie = {
  id: '11131',
  title: 'Coyote vs. Acme',
  year: '2026',
  poster: '',
  source: 'https://www.dvdsreleasedates.com/movies/11131/coyote-vs.-acme',
  checkedAt: '2026-10-23T17:08:03.665Z',
  releases: [],
};
const heading =
  "<h2>Coyote vs. Acme DVD and Blu-ray release date is set for <span class='future'>December 1, 2026</span> and available on Digital HD from Amazon Video and iTunes on <span class='past'>September 29, 2026</span>.</h2>";
const padding = '<!--' + '.'.repeat(500) + '-->';
const cell = (id: string, title: string) =>
  `<td class='dvdcell'><a href='/movies/${id}/${title.toLowerCase().replace(/\W/g, '-')}'><img alt='${title} DVD Release Date' src='/posters/110/A/Film-2026.jpg'></a></td>`;

test('Coyote detail lookup discovers the past Digital HD date and bypasses stale fetch caches', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), coyote.source);
    assert.equal(init?.cache, 'no-store');
    assert.equal('next' in init!, false);
    return new Response(
      heading + '<p itemprop="description">Wile E. Coyote takes Acme to court.</p>' + padding,
    );
  };
  try {
    const movie = await refreshMovie(coyote);
    assert.equal(movie.releases[0].date, '2026-09-29');
    assert.equal(movie.releases[0].kind, 'Digital');
    assert.equal(availableRelease(movie, '2026-10-24')?.date, '2026-09-29');
    assert.ok(movie.releaseCheckedAt);
  } finally {
    globalThis.fetch = original;
  }
});

test('release checks use their own timestamp, never a recent catalogue or synopsis timestamp', () => {
  const movie = { ...coyote, checkedAt: now.toISOString(), synopsisCheckedAt: now.toISOString() };
  assert.equal(releaseCheckDue(movie, now.getTime()), true);
  assert.equal(releaseCheckDue({ ...movie, releaseCheckedAt: 'invalid' }, now.getTime()), true);
  assert.equal(
    releaseCheckDue({ ...movie, releaseCheckedAt: '2026-10-24T06:00:00Z' }, now.getTime()),
    true,
  );
  assert.equal(
    releaseCheckDue({ ...movie, releaseCheckedAt: '2026-10-24T06:00:01Z' }, now.getTime()),
    false,
  );
});

test('a failed release parser or upstream response cannot certify dates as freshly checked', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(
        '<p itemprop="description">A valid synopsis but no recognized release heading.</p>' +
          padding,
      );
    await assert.rejects(refreshMovie(coyote), /format changed/);
    const synopsis = await refreshMovie(coyote, { discoverReleases: false });
    assert.equal(synopsis.releaseCheckedAt, undefined);
    globalThis.fetch = async () => new Response('Unavailable', { status: 503 });
    await assert.rejects(refreshMovie(coyote), /503/);
    assert.deepEqual(coyote.releases, []);
  } finally {
    globalThis.fetch = original;
  }
});

test('confirmed availability takes priority on cards while the next calendar window stays upcoming', () => {
  const digital = {
    kind: 'Digital' as const,
    date: '2026-09-29',
    confidence: 'listed' as const,
    source: coyote.source,
    sourceName: 'DVDs Release Dates',
  };
  const subscription = {
    ...digital,
    kind: 'Subscription' as const,
    date: '2026-12-01',
    platform: 'Netflix',
  };
  const movie = { ...coyote, releases: [digital, subscription] };
  assert.equal(displayRelease(movie, '2026-10-24'), digital);
  assert.equal(nextRelease(movie, '2026-10-24'), subscription);
  assert.equal(availableRelease(movie, '2026-09-29'), digital);
  const rumor = {
    ...movie,
    releases: [{ ...digital, confidence: 'rumored' as const }, subscription],
  };
  assert.equal(availableRelease(rumor, '2026-10-24'), undefined);
  assert.equal(displayRelease(rumor, '2026-10-24'), subscription);
});

test('archive coverage crosses year boundaries and includes next month', () => {
  const urls = digitalListingUrls(new Date('2026-01-31T23:59:59Z'));
  assert.equal(urls.length, 13);
  assert.equal(new Set(urls).size, 13);
  assert.match(urls[0], /2025\/2\/digital-hd-releases-february-2025$/);
  assert.match(urls[11], /2026\/1\/digital-hd-releases-january-2026$/);
  assert.match(urls[12], /2026\/2\/digital-hd-releases-february-2026$/);
  const december = digitalListingUrls(new Date('2026-12-31T23:59:59Z'));
  assert.match(december[12], /2027\/1\/digital-hd-releases-january-2027$/);
});

test('catalogue imports last month’s releases, preserves them across theatrical entries, and tolerates an unavailable archive', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(init?.cache, 'no-store');
    const path = String(url);
    if (path.includes('/2026/8/') || path.includes('whentostream'))
      return new Response('Unavailable', { status: 503 });
    let html = padding;
    if (path.includes('/2026/9/'))
      html +=
        "<td class='reldate past'>Tuesday September 29, 2026</td>" + cell(coyote.id, coyote.title);
    if (path.includes('/2026/10/'))
      html +=
        "<td class='reldate future'>Tuesday October 27, 2026</td>" +
        Array.from({ length: 10 }, (_, i) => cell(String(200 + i), `Film ${i}`)).join('');
    if (path.includes('new-movies'))
      html +=
        "<td class='reldate past'>Friday August 28, 2026</td>" + cell(coyote.id, coyote.title);
    return new Response(html);
  };
  try {
    const movies = await loadCatalogue(now),
      movie = movies.find((m) => m.id === coyote.id)!;
    assert.equal(movies.length, 11);
    assert.equal(movie.theatrical, '2026-08-28');
    assert.equal(movie.releases[0].date, '2026-09-29');
    assert.ok(availableRelease(movie, '2026-10-24'));
    const workingFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) =>
      String(url).includes('/2026/10/')
        ? new Response('Unavailable', { status: 503 })
        : workingFetch(url, init);
    await assert.rejects(loadCatalogue(now), /Current release listings unavailable/);
  } finally {
    globalThis.fetch = original;
  }
});

test('ordinary source lookups retain caching while explicit release checks use no-store alone', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      assert.equal((init as RequestInit & { next: { revalidate: number } }).next.revalidate, 21600);
      return new Response(padding);
    };
    await fetchSource(coyote.source);
  } finally {
    globalThis.fetch = original;
  }
});
