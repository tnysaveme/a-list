import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseSourceProfile } from '../lib/release-profile';
import { profileReference } from '../lib/reviewed-report-identities';
import { text } from '../lib/sources';
import { getMetadataEvidence, parseMetadataSearch, type MetadataEvidence } from '../lib/metadata';
import { automaticEvidence } from '../lib/release-automation';
import {
  corroborateCandidates,
  knownProfileMovies,
  profileSearchCandidates,
} from '../lib/release-matching';
import { identityAuditEvidence } from '../lib/wts-identity-audit';

async function fixture(slug: string, title: string) {
  const base = new URL('./fixtures/wts-identity/', import.meta.url);
  const html = await readFile(new URL(slug + '.html', base), 'utf8');
  const data = JSON.parse(await readFile(new URL(slug + '.json', base), 'utf8'));
  const reference = profileReference(html, title, text);
  assert.ok(reference);
  return { profile: parseSourceProfile(html, reference), data };
}
function metadataFetch(data: { details: { meta: { id: string } }[] }) {
  return async (input: string | URL | Request) => {
    const id = String(input).match(/\/meta\/movie\/(tt\d+)\.json$/)?.[1];
    const found = data.details.find((row) => row.meta.id === id);
    if (!found) throw new Error('Unexpected network request in identity fixture');
    return Response.json(found);
  };
}

test('captured translated search card is discovered while exact-ID metadata must establish its native title and credits', async () => {
  const { profile, data } = await fixture('koln-75-2025', 'Köln 75');
  const movies = parseMetadataSearch(data.search);
  assert.equal(movies[0].title, 'Cologne 75');
  assert.deepEqual(knownProfileMovies(profile, movies), []);
  const candidates = profileSearchCandidates(profile, movies);
  assert.equal(candidates.length, 1);
  const original = globalThis.fetch;
  try {
    globalThis.fetch = metadataFetch(data);
    const evidence = await corroborateCandidates(profile, candidates, AbortSignal.timeout(1000));
    assert.equal(evidence.movie.id, 'tt20414360');
    assert.equal(evidence.movie.title, 'Köln 75');
    assert.throws(
      () =>
        automaticEvidence(profile, [
          { ...evidence, movie: { ...evidence.movie, title: 'Cologne 75' } },
        ]),
      /insufficient_evidence/,
    );
    assert.throws(
      () => automaticEvidence(profile, [{ ...evidence, directors: ['Different Director'] }]),
      /insufficient_evidence/,
    );
    assert.throws(
      () => automaticEvidence(profile, [{ ...evidence, cast: [] }]),
      /insufficient_evidence/,
    );
    assert.throws(
      () =>
        automaticEvidence(profile, [
          evidence,
          { ...evidence, movie: { ...evidence.movie, id: 'tt9999999' } },
        ]),
      /ambiguous_identity/,
    );
    await assert.rejects(
      corroborateCandidates(
        profile,
        [
          ...candidates,
          ...['tt9000001', 'tt9000002', 'tt9000003'].map((id) => ({
            ...candidates[0],
            id,
            imdbId: id,
          })),
        ],
        AbortSignal.timeout(1000),
      ),
      /ambiguous_identity/,
    );
    assert.deepEqual(
      profileSearchCandidates(
        profile,
        candidates.map((movie) => ({ ...movie, mediaType: 'series' })),
      ),
      [],
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('captured sparse cast year drift needs exact long synopsis, director, runtime, theatrical date and one complete cast credit', async () => {
  const { profile, data } = await fixture('strange-harvest-2024', 'Strange Harvest');
  const original = globalThis.fetch;
  try {
    globalThis.fetch = metadataFetch(data);
    const evidence = await getMetadataEvidence('tt33400719');
    assert.notEqual(profile.year, evidence.movie.year);
    assert.equal(automaticEvidence(profile, [evidence]).movie.id, 'tt33400719');
    const audit = identityAuditEvidence(profile, [evidence])[0];
    assert.equal(audit.qualifies, true);
    assert.equal(audit.agreement.cast, 1);
    assert.ok(audit.evidenceGaps.includes('year_difference'));
    for (const changed of [
      { ...evidence, facts: { ...evidence.facts, runtime: 110 } },
      { ...evidence, facts: { ...evidence.facts, theatrical: '2025-09-08' } },
      { ...evidence, directors: ['Other Director'] },
      { ...evidence, movie: { ...evidence.movie, year: '2028' } },
      {
        ...evidence,
        movie: { ...evidence.movie, overview: 'A different plot with a similar genre.' },
      },
      { ...evidence, cast: [] },
      { ...evidence, movie: { ...evidence.movie, title: 'Strange Harvest 2' } },
      { ...evidence, movie: { ...evidence.movie, mediaType: 'series' as const } },
    ] satisfies MetadataEvidence[])
      assert.throws(() => automaticEvidence(profile, [changed]), /insufficient_evidence/);
    assert.throws(
      () =>
        automaticEvidence({ ...profile, facts: { ...profile.facts, series: true } }, [evidence]),
      /insufficient_evidence/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('discovery fallback retains unknown-year competitors and never truncates a crowded set into uniqueness', async () => {
  const { profile, data } = await fixture('koln-75-2025', 'Köln 75');
  const [movie] = parseMetadataSearch(data.search);
  const crowded = [...Array(4)].map((_, index) => ({
    ...movie,
    id: `tt999999${index}`,
    imdbId: `tt999999${index}`,
    year: index === 3 ? '' : '2025',
  }));
  assert.equal(profileSearchCandidates(profile, crowded).length, 4);
  await assert.rejects(
    corroborateCandidates(
      profile,
      profileSearchCandidates(profile, crowded),
      AbortSignal.timeout(1000),
    ),
    /ambiguous_identity/,
  );
  assert.deepEqual(profileSearchCandidates(profile, [{ ...movie, year: '1990' }]), []);
});
