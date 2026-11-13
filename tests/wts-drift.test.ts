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
