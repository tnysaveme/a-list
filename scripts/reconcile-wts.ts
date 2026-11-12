import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
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
const args = process.argv.slice(2),
  repair = args.includes('--repair');
if (args.includes('--help')) {
  console.log(
    'Audit all indexed WTS film profiles (read-only by default).\n npm run wts:reconcile -- [--repair] [--index] [--due] [--limit 1000] [--concurrency 2] [--source-id ID]\n--index refreshes the complete public page index and requires --repair. --due resumes only queued checks. Source repairs use the app publication rules; personal libraries are never edited.',
  );
  process.exit(0);
}
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const value = (name: string) => args[args.indexOf(name) + 1];
const limit = args.includes('--limit') ? Number(value('--limit')) : 1000,
  concurrency = args.includes('--concurrency') ? Number(value('--concurrency')) : 2,
  sourceId = args.includes('--source-id') ? value('--source-id') : undefined;
if (!Number.isInteger(limit) || limit < 1 || limit > 2000)
  throw Error('Choose a limit from 1 to 2000');
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4)
  throw Error('Choose concurrency from 1 to 4');
if (args.includes('--source-id') && (!sourceId || !/^\d{1,10}$/.test(sourceId)))
  throw Error('Invalid WTS source ID');
if (args.includes('--index') && !repair)
  throw Error('--index requires --repair; normal audits are read-only');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw Error('Server Supabase configuration is required');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { checked } = await import('../lib/db-result');
const { indexWtsProfiles, inventoryEntries, checkpointWtsProfiles } =
  await import('../lib/wts-inventory');
const { expandReleases } = await import('../lib/release-expansion');
const knownMovies: import('../lib/model').Movie[] = [];
for (let offset = 0; ; offset += 500) {
  const page = checked(
    await db
      .from('a_list_movies')
      .select('movie')
      .order('id')
      .range(offset, offset + 499),
  );
  knownMovies.push(...page.map((row) => row.movie as import('../lib/model').Movie));
  if (page.length < 500) break;
}
if (args.includes('--index')) {
  checked(
    await db
      .from('a_list_source_status')
      .update({ wts_profile_page: 1, wts_profile_after: new Date().toISOString() })
      .eq('id', true),
  );
  let page = 1;
  for (let attempt = 0; attempt < 1000; attempt++) {
    await indexWtsProfiles({ wts_profile_page: page }, db, AbortSignal.timeout(12000));
    const state = checked(
      await db.from('a_list_source_status').select('wts_profile_page').eq('id', true).single(),
    );
    console.log(JSON.stringify({ event: 'wts_index_page', page }));
    if (state.wts_profile_page === 1) break;
    page = state.wts_profile_page;
  }
}
const rows: import('../lib/wts-inventory').InventoryRow[] = [];
const savedIds = new Set(
  checked(await db.from('a_list_library').select('movie_id')).map((row) => row.movie_id),
);
for (let offset = 0; rows.length < limit; offset += 500) {
  let query = db
    .from('a_list_wts_profiles')
    .select('source_id,source,title,film_year,modified_at,failures,attempts,priority,movie_id')
    .order('source_id')
    .range(offset, Math.min(offset + 499, limit - 1));
  if (sourceId) query = query.eq('source_id', sourceId);
  if (args.includes('--due')) query = query.lte('check_after', new Date().toISOString());
  const page = checked(await query);
  rows.push(
    ...page.map((row) => ({ ...row, saved: !!row.movie_id && savedIds.has(row.movie_id) })),
  );
  if (page.length < 500) break;
}
console.log(JSON.stringify({ mode: repair ? 'repair' : 'read-only', profiles: rows.length }));
const totals: Record<string, number> = {};
let next = 0;
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (next < rows.length) {
      const row = rows[next++];
      const result = await expandReleases(inventoryEntries([row]), {
        db,
        dryRun: !repair,
        publishUnknown: true,
        checkpoint: false,
        limit: 1,
        knownMovies,
      });
      const decision = result.decisions[0];
      if (repair)
        await checkpointWtsProfiles([row], result.decisions, db, AbortSignal.timeout(5000));
      const outcome = decision?.outcome || 'budget_exhausted';
      totals[outcome] = (totals[outcome] || 0) + 1;
      console.log(JSON.stringify({ source: row.source, title: row.title, ...decision }));
    }
  }),
);
console.log(
  JSON.stringify({ mode: repair ? 'repair' : 'read-only', checked: rows.length, totals }),
);
