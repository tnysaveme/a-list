import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { refreshMovie } from '../lib/movie-refresh';
import { failedRefreshMovie } from '../lib/source-errors';
import type { Movie } from '../lib/model';
import { activeReleaseIdentities, type MatchRow } from '../lib/release-automation';
import { reviewedReportIdentities } from '../lib/reviewed-report-identities';

const args = process.argv.slice(2),
  repair = args.includes('--repair'),
  saved = args.includes('--saved');
if (args.includes('--help')) {
  console.log(
    'Check source failures (read-only by default).\n  npm run sources:check -- [--limit 30] [--saved] [--repair]\n--repair stores verified results with a row-version guard; it never changes personal libraries.',
  );
  process.exit(0);
}
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const index = args.indexOf('--limit'),
  limit = index === -1 ? 30 : Number(args[index + 1]);
if (!Number.isInteger(limit) || limit < 1 || limit > 100)
  throw new Error('Choose a limit between 1 and 100');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Source diagnostics need server-side Supabase configuration');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const checked = <T>({ data, error }: { data: T; error: { message: string } | null }) => {
  if (error) throw new Error(error.message);
  return data;
};
let query = db
  .from('a_list_movies')
  .select('id,movie,updated_at,refresh_failures')
  .order('refresh_failures', { ascending: false })
  .limit(limit);
if (saved) {
  const ids =
    checked(await db.from('a_list_library').select('movie_id'))?.map((row) => row.movie_id) || [];
  if (!ids.length) {
    console.log('No saved films to check');
    process.exit(0);
  }
  query = query.in('id', [...new Set(ids)]);
} else query = query.gt('refresh_failures', 0);
const rows = checked(await query) || [];
const matchRows: MatchRow[] = [];
for (let offset = 0; ; offset += 500) {
  const page = checked(
    await db
      .from('a_list_release_candidates')
      .select('*')
      .order('source_id')
      .range(offset, offset + 499),
  ) as MatchRow[];
  matchRows.push(...page);
  if (page.length < 500) break;
}
const identities = activeReleaseIdentities(matchRows, reviewedReportIdentities),
  checks = new Map<string, boolean>();
const result: { id: string; status: string; issues?: unknown }[] = [];
console.log(JSON.stringify({ mode: repair ? 'repair' : 'read-only', films: rows.length }));
for (let start = 0; start < rows.length; start += 3) {
  await Promise.all(
    rows.slice(start, start + 3).map(async (row) => {
      try {
        const current = row.movie as Movie;
        const fresh = await refreshMovie(current, {
          identities,
          onSourceResult: (check) => {
            const source = check.source === 'wts' ? 'wts_reports' : 'primary';
            checks.set(source, (checks.get(source) ?? true) && check.success);
          },
        });
        const partial = fresh.releaseCheck?.status === 'partial';
        if (repair) {
          const stored = checked(
            await db
              .from('a_list_movies')
              .update({
                movie: fresh,
                updated_at: new Date().toISOString(),
                refresh_failures: partial ? row.refresh_failures + 1 : 0,
                requested_at: null,
                refresh_after: new Date(
                  Date.now() + (partial ? 15 * 60_000 : 6 * 3600_000),
                ).toISOString(),
              })
              .eq('id', row.id)
              .eq('updated_at', row.updated_at)
              .select('id'),
          );
          if (!stored?.length) {
            result.push({ id: row.id, status: 'concurrent_change' });
            return;
          }
        }
        result.push({
          id: row.id,
          status: partial
            ? 'partial'
            : fresh.primaryListingUnavailable
              ? 'no_primary_listing'
              : 'healthy',
          ...(partial ? { issues: fresh.releaseCheck?.issues } : {}),
        });
      } catch (error) {
        const movie = failedRefreshMovie(row.movie as Movie, error);
        if (repair)
          checked(
            await db
              .from('a_list_movies')
              .update({ movie, updated_at: new Date().toISOString() })
              .eq('id', row.id)
              .eq('updated_at', row.updated_at),
          );
        result.push({ id: row.id, status: 'failed', issues: movie.releaseCheck?.issues });
      }
      console.log(JSON.stringify(result.at(-1)));
    }),
  );
}
if (repair)
  for (const [source, success] of checks)
    checked(await db.rpc('a_list_record_source_check', { p_source: source, p_success: success }));
const failed = result.filter((row) => row.status === 'failed' || row.status === 'partial').length;
console.log(
  JSON.stringify({
    checked: result.length,
    healthy: result.length - failed,
    failed,
    mode: repair ? 'repair' : 'read-only',
  }),
);
if (failed) process.exitCode = 1;
