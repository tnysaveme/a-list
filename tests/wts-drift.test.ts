import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inspectWtsProfile, inspectWtsFeed } from '../lib/wts-drift';
import manifest from './fixtures/wts/manifest.json';
const fixture = (name: string) =>
  readFile(new URL(`./fixtures/wts/${name}`, import.meta.url), 'utf8');
test('captured WTS profiles preserve native subjects and real N/A, punctuation and split TBA formats', async () => {
  const results = [];
  for (const profile of manifest.profiles) {
    const html = await fixture(profile.file);
    const expected = {
      ...profile,
      expectedKinds: profile.expectedKinds as Parameters<
        typeof inspectWtsProfile
      >[1]['expectedKinds'],
    };
    const result = inspectWtsProfile(html, expected);
    results.push(result.evidence);
    assert.throws(
      () => inspectWtsProfile(html.replace(`post-${profile.sourceId}`, 'post-999999'), expected),
      /subject/,
    );
  }
  assert.equal(results[0].reports[0].release.kind, 'Subscription');
  assert.ok(results[0].withdrawnKinds.includes('PVOD'));
  assert.equal(results[1].reports[0].release.date, '2026-07-17');
  assert.equal(results[2].reports.length, 0);
  assert.ok(results[2].withdrawnKinds.includes('Subscription'));
});
test('captured RSS parses CDATA and drift detection fails closed on challenge pages and empty feeds', async () => {
  assert.ok(inspectWtsFeed(await fixture(manifest.feed.file)).length);
  for (const bad of ['<html>Checking your browser</html>', '<rss><channel></channel></rss>'])
    assert.throws(() => inspectWtsFeed(bad));
});

test('a single disappearing release field is detected while other fields still parse', async () => {
  const expected = {
    ...manifest.profiles[1],
    expectedKinds: ['Digital', 'Subscription'] as ('Digital' | 'Subscription')[],
  };
  const html = await fixture(expected.file);
  assert.throws(
    () => inspectWtsProfile(html.replace(/SVOD Release Date/gi, 'Retired field'), expected),
    /release fields changed/,
  );
});

test('daily probes keep three anchors and rotate a bounded representative sample', async () => {
  const { selectWtsProfiles } = await import('../lib/wts-drift');
  const profiles = manifest.profiles as Parameters<typeof selectWtsProfiles>[0];
  const first = selectWtsProfiles(profiles, Date.parse('2026-11-14T00:00:00Z'));
  const same = selectWtsProfiles(profiles, Date.parse('2026-11-14T23:59:59Z'));
  const next = selectWtsProfiles(profiles, Date.parse('2026-11-15T00:00:00Z'));
  assert.equal(first.length, 5);
  assert.deepEqual(first, same);
  assert.deepEqual(first.slice(0, 3), profiles.slice(0, 3));
  assert.notDeepEqual(first.slice(3), next.slice(3));
  assert.equal(new Set(first.map((profile) => profile.sourceId)).size, 5);
});

test('drift probes retry once, cap source concurrency, distinguish recovered checks and preserve safe actionable failures', async () => {
  const { probeWtsSources, driftSummary } = await import('../lib/wts-drift');
  const pages = new Map(
    await Promise.all(
      manifest.profiles.map(async (profile) => [profile.url, await fixture(profile.file)] as const),
    ),
  );
  pages.set(manifest.feed.url, await fixture(manifest.feed.file));
  const calls = new Map<string, number>();
  let active = 0,
    maximum = 0;
  const records = await probeWtsSources({
    profiles: manifest.profiles as Parameters<typeof probeWtsSources>[0]['profiles'],
    feedUrl: manifest.feed.url,
    now: Date.parse('2026-11-14T00:00:00Z'),
    read: async (url) => {
      active++;
      maximum = Math.max(maximum, active);
      try {
        await new Promise((resolve) => setTimeout(resolve, 1));
        const count = (calls.get(url) || 0) + 1;
        calls.set(url, count);
        if (url === manifest.profiles[0].url && count === 1)
          throw new Error('HTTP 503 PRIVATE_SECRET');
        if (url === manifest.profiles[1].url)
          return pages.get(url)!.replace(/SVOD Release Date/g, 'Retired field');
        if (url === manifest.feed.url)
          throw new Error('HTTP 503 PRIVATE_SECRET https://private.invalid/token');
        return pages.get(url)!;
      } finally {
        active--;
      }
    },
  });
  assert.equal(records.length, 6);
  assert.ok(maximum <= 2);
  assert.ok(maximum > 1);
  assert.ok([...calls.values()].every((count) => count <= 2));
  assert.equal(records[0].recovered, true);
  assert.equal(records[0].ok, true);
  assert.equal(records[0].attempts, 2);
  assert.equal(records[1].confirmed, true);
  assert.equal(records[1].ok, false);
  assert.deepEqual(records[1].missingKinds, ['Subscription']);
  assert.equal(records.at(-1)!.category, 'http_error');
  assert.equal(records.at(-1)!.status, 503);
  assert.doesNotMatch(JSON.stringify(records), /PRIVATE_SECRET|private.invalid/);
  assert.match(driftSummary(records), /Confirmed failure/);
  assert.match(driftSummary(records), /Recovered on retry/);
});
