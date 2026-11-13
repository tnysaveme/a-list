import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import type { Movie } from '../lib/model';
import type { LookupCache } from '../lib/release-lookup';

// This operator command uses the server modules outside Next's module resolver.
registerHooks({
  resolve(s, c, next) {
    return s === 'server-only'
      ? {
          url: new URL('../node_modules/next/dist/compiled/server-only/empty.js', import.meta.url)
            .href,
          shortCircuit: true,
        }
      : next(s, c);
  },
});
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(
    'Reconcile WTS coverage (read-only by default).\n  npm run wts:check -- [--repair] [--limit 1000] [--id MOVIE_ID]\nUses the same bounded lookup and identity rules as the app; --repair publishes verified dates and reschedules checks. Personal libraries are never edited.',
  );
  process.exit(0);
}
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const repair = args.includes('--repair'),
  value = (name: string) => args[args.indexOf(name) + 1],
  limit = args.includes('--limit') ? Number(value('--limit')) : 1000,
  concurrency = args.includes('--concurrency') ? Number(value('--concurrency')) : 2,
  id = args.includes('--id') ? value('--id') : undefined;
if (!Number.isInteger(limit) || limit < 1 || limit > 2000)
  throw new Error('Choose a limit from 1 to 2000');
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4)
  throw new Error('Choose concurrency from 1 to 4');
if (id && !/^(?:\d{1,8}|tt\d{7,10})$/.test(id)) throw new Error('Invalid movie ID');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Server Supabase configuration is required');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { lookupReleaseReports, needsReportLookup } = await import('../lib/release-lookup');
const { expandReleases } = await import('../lib/release-expansion');
const { verifiedIdentityId } = await import('../lib/film-identity');
const { checked } = await import('../lib/db-result');
const rows: { id: string; movie: Movie }[] = [];
for (let offset = 0; rows.length < limit; offset += 500) {
  let query = db
    .from('a_list_movies')
    .select('id,movie')
    .order('id')
    .range(offset, Math.min(offset + 499, limit - 1));
  if (id) query = query.eq('id', id);
  const page = checked(await query) as typeof rows;
  rows.push(...page);
  if (page.length < 500) break;
}
const completed = new Set<string>();
if (args.includes('--resume')) {
  for (const line of (await readFile(value('--resume'), 'utf8')).split('\n')) {
    try {
      const result = JSON.parse(line);
      if (result.id && ['matched', 'no_report', 'ineligible'].includes(result.outcome))
        completed.add(result.id);
    } catch {}
  }
}
const seen = new Set<string>();
const candidates = rows.filter((row) => {
  const identity = verifiedIdentityId(row.movie) || row.id;
  if (!needsReportLookup(row.movie) || seen.has(identity) || completed.has(row.id)) return false;
  seen.add(identity);
  return true;
});
const totals: Record<string, number> = {};
console.log(
  JSON.stringify({
    mode: repair ? 'repair' : 'read-only',
    rows: rows.length,
    candidates: candidates.length,
  }),
);
let next = 0;
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (next < candidates.length) {
      const row = candidates[next++];
      await (async () => {
        const decisions: unknown[] = [];
        const lookupCache: LookupCache = {
          read: async () => null,
          write: async () => {},
          lease: async (_key, _ttl, work) => work(),
        };
        // A dry run must not run the identity bootstrap, which writes a verified primary row.
        if (!repair && !verifiedIdentityId(row.movie)) {
          totals.identity_pending = (totals.identity_pending || 0) + 1;
          console.log(JSON.stringify({ id: row.id, outcome: 'identity_pending' }));
          return;
        }
        const result = await lookupReleaseReports(row.movie, {
          force: true,
          persist: repair,
          db,
          lookupCache,
          expand: async (entries, options) => {
            const result = await expandReleases(entries, {
              ...options,
              dryRun: !repair,
              publishUnknown: true,
            });
            decisions.push(...result.decisions);
            return result;
          },
        });
        totals[result.outcome] = (totals[result.outcome] || 0) + 1;
        if (repair && result.nextCheckAt)
          checked(
            await db
              .from('a_list_movies')
              .update({ report_lookup_after: result.nextCheckAt })
              .eq('id', row.id),
          );
        console.log(
          JSON.stringify({
            id: row.id,
            title: row.movie.title,
            outcome: result.outcome,
            decisions,
          }),
        );
      })();
    }
  }),
);
console.log(
  JSON.stringify({ mode: repair ? 'repair' : 'read-only', checked: candidates.length, totals }),
);
