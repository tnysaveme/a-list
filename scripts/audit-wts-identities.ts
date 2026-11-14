import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { checked } from '../lib/db-result';
import { fetchSource, profileReleaseEvidence, text } from '../lib/sources';
import { profileReference } from '../lib/reviewed-report-identities';
import { parseSourceProfile } from '../lib/release-profile';
import { searchMetadata, type MetadataEvidence } from '../lib/metadata';
import { corroborateCandidates, profileSearchCandidates } from '../lib/release-matching';
import { releaseSearchTitle } from '../lib/release-evidence';
import { identityAuditEvidence } from '../lib/wts-identity-audit';
import { releaseDiagnostic } from '../lib/release-diagnostics';
import { UnresolvedRelease } from '../lib/release-automation';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(
    'Inspect held WTS identity evidence without writing application data.\n npm run wts:identity-audit -- [--id WTS_SOURCE_ID] [--limit 10]\nAt most two profiles run concurrently with a 20-second deadline each. Search cards are discovery only; exact-ID film details and credits establish identity. Evidence gaps are not standalone rejection rules.',
  );
  process.exit(0);
}
const argument = (name: string) => args[args.indexOf(name) + 1],
  limit = args.includes('--limit') ? Number(argument('--limit')) : 10,
  id = args.includes('--id') ? argument('--id') : undefined;
if (!Number.isInteger(limit) || limit < 1 || limit > 100)
  throw Error('Choose a limit from 1 to 100');
if (args.includes('--id') && (!id || !/^\d{1,10}$/.test(id))) throw Error('Invalid WTS source ID');
if (args.some((arg, index) => index % 2 === 0 && !['--id', '--limit'].includes(arg)))
  throw Error('Only --id and --limit are supported; this audit never repairs or publishes');
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw Error('Server Supabase configuration is required');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
let query = db
  .from('a_list_wts_profiles')
  .select('source_id,source,title,film_year,outcome,priority,movie_id')
  .order('priority', { ascending: false })
  .order('film_year', { ascending: false })
  .order('source_id')
  .limit(limit);
query = id
  ? query.eq('source_id', id)
  : query.in('outcome', [
      'insufficient_evidence',
      'ambiguous_identity',
      'identity_evidence_conflict',
      'metadata_not_listed',
    ]);
const rows = checked(await query.abortSignal(AbortSignal.timeout(5000))) || [];
const movieIds = rows.map((row) => row.movie_id).filter((value): value is string => !!value);
const saved = new Set<string>(
  movieIds.length
    ? (
        checked(
          await db
            .from('a_list_library')
            .select('movie_id')
            .in('movie_id', movieIds)
            .abortSignal(AbortSignal.timeout(5000)),
        ) || []
      ).map((row) => row.movie_id)
    : [],
);
rows.sort((a, b) => Number(saved.has(b.movie_id)) - Number(saved.has(a.movie_id)));
let next = 0;
const totals: Record<string, number> = {},
  gaps: Record<string, number> = {};
console.log(
  JSON.stringify({ event: 'wts_identity_audit', mode: 'read-only', profiles: rows.length }),
);
await Promise.all(
  Array.from({ length: Math.min(2, rows.length) }, async () => {
    while (next < rows.length) {
      const row = rows[next++],
        started = Date.now(),
        signal = AbortSignal.timeout(20000);
      let outcome = 'insufficient_evidence',
        evidence: MetadataEvidence[] = [],
        candidates: ReturnType<typeof identityAuditEvidence> = [],
        discovery: { results: number; shortlisted: number } | null = null,
        upcoming: boolean | null = null;
      try {
        const html = await fetchSource(row.source, { cache: 'no-store', signal });
        const reference = profileReference(html, row.title, text);
        if (
          !reference ||
          reference.sourceFilmId !== row.source_id ||
          reference.sourceFilmUrl !== row.source
        )
          throw new UnresolvedRelease('conflicting_source_identity');
        const profile = parseSourceProfile(html, reference);
        if (profile.facts?.series) throw new UnresolvedRelease('not_movie');
        upcoming = profileReleaseEvidence(html, reference).reports.some(
          (report) => report.release.date >= new Date().toISOString().slice(0, 10),
        );
        const results = await searchMetadata(
          releaseSearchTitle(profile.title, profile.facts?.nonfiction, profile.directors),
          signal,
        );
        const movies = profileSearchCandidates(profile, results);
        discovery = { results: results.length, shortlisted: movies.length };
        try {
          await corroborateCandidates(profile, movies, signal, (checkedEvidence) => {
            evidence = checkedEvidence;
          });
          outcome = 'matched';
        } finally {
          candidates = identityAuditEvidence(profile, evidence);
        }
      } catch (error) {
        outcome =
          error instanceof UnresolvedRelease
            ? error.message
            : releaseDiagnostic(error, 'identity', Date.now() - started, signal.aborted).category;
      }
      totals[outcome] = (totals[outcome] || 0) + 1;
      if (outcome !== 'matched')
        for (const gap of new Set(candidates.flatMap((candidate) => candidate.evidenceGaps)))
          gaps[gap] = (gaps[gap] || 0) + 1;
      console.log(
        JSON.stringify({
          event: 'wts_identity_audit_profile',
          sourceId: row.source_id,
          title: row.title,
          previousOutcome: row.outcome,
          outcome,
          priority: row.priority,
          saved: row.movie_id ? saved.has(row.movie_id) : null,
          upcoming,
          discovery,
          candidates,
          durationMs: Date.now() - started,
        }),
      );
    }
  }),
);
console.log(
  JSON.stringify({
    event: 'wts_identity_audit_summary',
    mode: 'read-only',
    profiles: rows.length,
    totals,
    heldEvidenceGaps: gaps,
  }),
);
