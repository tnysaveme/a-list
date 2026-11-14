import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { profileReference } from '../lib/reviewed-report-identities';
import { profileReleaseEvidence, text } from '../lib/sources';
import { parseSourceProfile } from '../lib/release-profile';
const fixture = (name: string) =>
  readFile(new URL(`./fixtures/wts/${name}.html`, import.meta.url), 'utf8');
const evidence = (html: string, title: string) =>
  profileReleaseEvidence(html, profileReference(html, title, text)!);

test('captured multi-platform subscription premieres retain the earliest real window and its corresponding platform', async () => {
  const html = await fixture('project-hail-mary-2026');
  const result = evidence(html, 'Project Hail Mary');
  assert.deepEqual(result.malformedKinds, []);
  assert.deepEqual(
    result.reports.map((row) => [row.release.kind, row.release.date, row.release.platform]),
    [
      ['PVOD', '2026-05-12', undefined],
      ['Subscription', '2026-06-18', 'MGM+'],
    ],
  );
  const reversed = html.replace(
    'June 18, 2026 (MGM+); July 3, 2026 (Prime Video)',
    'July 3, 2026 (Prime Video); June 18, 2026 (MGM+)',
  );
  const release = evidence(reversed, 'Project Hail Mary').reports.find(
    (row) => row.release.kind === 'Subscription',
  )!.release;
  assert.equal(release.date, '2026-06-18');
  assert.equal(release.platform, 'MGM+');
});

test('multi-date windows stay withheld when a platform, date, delimiter or subject is ambiguous', async () => {
  const html = await fixture('project-hail-mary-2026');
  for (const field of [
    'June 18, 2026 (MGM+); July 3, 2026 (MGM+)',
    'June 18, 2026 (Apple TV); July 3, 2026 (Apple TV+)',
    'June 18, 2026 (MGM+); July 3, 2026',
    'June 18, 2026 (MGM+); February 30, 2026 (Prime Video)',
    'June 18, 2026 (MGM+), July 3, 2026 (Prime Video)',
    'June 18, 2026 (MGM+); July 3, 2026 (Unknown Service)',
    'June 18, 2026 (MGM+); July 3, 2026 (Prime Video and Netflix)',
    'June 18, 2026 (MGM+); July 3, 2026 (Prime Video) until July 5, 2026',
  ]) {
    const result = evidence(
      html.replace('June 18, 2026 (MGM+); July 3, 2026 (Prime Video)', field),
      'Project Hail Mary',
    );
    assert.ok(result.malformedKinds.includes('Subscription'), field);
    assert.equal(
      result.reports.filter((row) => row.release.kind === 'Subscription').length,
      0,
      field,
    );
    assert.ok(
      result.reports.some((row) => row.release.kind === 'PVOD'),
      field,
    );
  }
  const multipleRental = html.replace(
    'May 12, 2026',
    'May 12, 2026 (MGM+); May 13, 2026 (Prime Video)',
  );
  assert.ok(evidence(multipleRental, 'Project Hail Mary').malformedKinds.includes('PVOD'));
  assert.throws(
    () =>
      profileReleaseEvidence(
        html.replace('post-14465', 'post-99999'),
        profileReference(html, 'Project Hail Mary', text)!,
      ),
    /identity/,
  );
});

test('captured concert upstream typo remains unavailable while the independently valid subscription date survives', async () => {
  const html = await fixture('epic-elvis-presley-in-concert-2025');
  const result = evidence(html, 'EPIC: ELVIS PRESLEY IN CONCERT');
  assert.deepEqual(result.malformedKinds, ['PVOD']);
  assert.deepEqual(
    result.reports.map((row) => [row.release.kind, row.release.date, row.release.platform]),
    [['Subscription', '2026-06-03', 'Paramount+']],
  );
  const profile = parseSourceProfile(
    html,
    profileReference(html, 'EPIC: ELVIS PRESLEY IN CONCERT', text)!,
  );
  assert.equal(profile.facts?.nonfiction, true);
});

test('international and documentary source excerpts keep their native years, credits and independent windows', async () => {
  for (const [name, title, year, nonfiction] of [
    ['ne-zha-ii-2025', 'Ne Zha II', '2025', false],
    ['scarlet-2025', 'Scarlet', '2025', false],
    ['architecton-2024', 'Architecton', '2024', true],
    ['predators-2025', 'Predators', '2025', true],
  ] as const) {
    const html = await fixture(name),
      reference = profileReference(html, title, text)!;
    const profile = parseSourceProfile(html, reference),
      result = profileReleaseEvidence(html, reference);
    assert.equal(profile.year, year);
    assert.equal(!!profile.facts?.nonfiction, nonfiction);
    assert.ok(profile.directors.length);
    assert.ok(profile.overview.length);
    assert.equal(result.reports.length, 2);
    assert.deepEqual(result.malformedKinds, []);
    assert.throws(
      () =>
        profileReleaseEvidence(
          html.replace(
            `<h1 class="entry-title">${title} (${year})</h1>`,
            `<h1 class="entry-title">${title} (1999)</h1>`,
          ),
          reference,
        ),
      /identity/,
    );
    const unrelated = html + '<p>SVOD Release Date: January 1, 2099 (Netflix)</p>';
    assert.deepEqual(
      profileReleaseEvidence(unrelated, reference).reports.map((row) => row.release.date),
      result.reports.map((row) => row.release.date),
    );
  }
});
