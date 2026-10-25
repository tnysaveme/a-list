import 'server-only';
import { randomUUID } from 'node:crypto';
import { adminDb } from './supabase/admin';
import { checked } from './db-result';
import { withLease, remember, metric, cache } from './infrastructure';
import { mergeMovies, type Movie } from './model';
import { loadCatalogue } from './release-catalogue';
import { refreshMovie } from './movie-refresh';
import { drainDue } from './work-batches';
import { releaseIdentities, releaseImports } from './release-store';
import { verifySearchListings, enrichCatalogueReports } from './source-verification';
import { mergeImportedCatalogue } from './imported-catalogue';
import { expandReleases, expansionFeed } from './release-expansion';
import { SIX_HOURS, type FeedEntry } from './release-automation';
import { refreshReportLookups } from './release-lookup';
import { recordSourceCheck } from './source-checks';
import { TRANSIENT_RETRY_MS } from './source-health';
import { movieRows } from './movie-rows';
import { failedRefreshMovie } from './source-errors';

export async function refreshSources() {
  return withLease('ingestion', 55, async () => {
    const started = Date.now(),
      signal = AbortSignal.timeout(45000),
      db = adminDb(),
      now = new Date().toISOString();
    const [identities, status] = await Promise.all([
      releaseIdentities(),
      db.from('a_list_source_status').select('*').eq('id', true).single().then(checked),
    ]);
    checked(
      await db
        .from('a_list_source_status')
        .update({ last_attempt_at: now })
        .eq('id', true)
        .abortSignal(signal),
    );
    let catalogueUpdated = false,
      refreshed = 0,
      failed = 0,
      feed: FeedEntry[] = status.wts_feed || [],
      feedLoaded = false;
    const checks = new Map<string, boolean>();
    const onSourceResult = ({
      source,
      success,
    }: {
      source: 'primary' | 'wts';
      success: boolean;
    }) => {
      const key = source === 'wts' ? 'wts_reports' : 'primary';
      checks.set(key, (checks.get(key) ?? true) && success);
    };
    type Candidate = { id: string; movie: Movie; refresh_failures: number; updated_at: string };
    // Personal date updates get first use of the existing job, ahead of catalogue expansion.
    await drainDue<Candidate>(
      async () =>
        checked(
          await db.rpc('a_list_refresh_candidates', { p_limit: 8 }).abortSignal(signal),
        ) as Candidate[],
      async (row) => {
        try {
          let partial = false;
          const movie = await refreshMovie(row.movie, {
            identities,
            signal,
            onSourceResult: (result) => {
              onSourceResult(result);
              partial ||= !result.success;
            },
          });
          const saved = checked(
            await db
              .from('a_list_movies')
              .update({
                movie,
                updated_at: new Date().toISOString(),
                refresh_after: new Date(
                  Date.now() + (partial ? TRANSIENT_RETRY_MS : SIX_HOURS),
                ).toISOString(),
                requested_at: null,
                refresh_failures: partial ? row.refresh_failures + 1 : 0,
              })
              .eq('id', row.id)
              .eq('updated_at', row.updated_at)
              .select('id')
              .abortSignal(signal),
          );
          if (saved?.length) {
            refreshed++;
            if (partial) failed++;
          }
        } catch (error) {
          const movie = failedRefreshMovie(row.movie, error);
          failed++;
          checked(
            await db
              .from('a_list_movies')
              .update({
                movie,
                updated_at: new Date().toISOString(),
                refresh_failures: row.refresh_failures + 1,
                refresh_after: new Date(
                  Date.now() +
                    Math.min(
                      SIX_HOURS,
                      TRANSIENT_RETRY_MS * 2 ** Math.min(row.refresh_failures, 4),
                    ),
                ).toISOString(),
              })
              .eq('id', row.id)
              .eq('updated_at', row.updated_at)
              .abortSignal(signal),
          );
          console.warn(
            JSON.stringify({
              event: 'film_refresh_failed',
              movieId: row.id,
              issues: movie.releaseCheck?.issues,
            }),
          );
        }
      },
      { started, budgetMs: 18000 },
    );
    if (Date.now() - started < 28000) {
      try {
        const lookups = await refreshReportLookups({
          db,
          signal: AbortSignal.any([signal, AbortSignal.timeout(13000)]),
        });
        failed += lookups.failures;
      } catch {
        failed++;
        console.warn(JSON.stringify({ event: 'saved_report_lookup_deferred' }));
      }
    }
    async function getFeed() {
      if (feedLoaded) return;
      feedLoaded = true;
      try {
        feed = await expansionFeed(
          status,
          AbortSignal.any([signal, AbortSignal.timeout(10000)]),
          db,
        );
      } catch {
        failed++;
        await recordSourceCheck(db, 'wts_feed', false);
        console.warn(JSON.stringify({ event: 'release_feed_unavailable' }));
      }
    }
    if (
      (!status.catalogue_success_at ||
        Date.now() - Date.parse(status.catalogue_success_at) >= SIX_HOURS) &&
      Date.now() - started < 28000
    ) {
      try {
        // One feed snapshot supplies both enrichment and new-film discovery.
        await getFeed();
        const [listing, importRows] = await Promise.all([
          loadCatalogue(new Date(), identities, undefined, { enrichReports: false, signal }),
          releaseImports(),
        ]);
        const existing = await movieRows(
          db,
          listing.map((movie) => movie.id),
          signal,
        );
        // The version must belong to the exact snapshot used to build each candidate.
        const rows = new Map([...existing, ...importRows].map((row) => [row.id, row]));
        const old = new Map([...rows.values()].map((row) => [row.id, row.movie as Movie]));
        const imports = importRows.map((row) => row.movie);
        const primary = listing.map((movie) =>
          old.has(movie.id) ? mergeMovies([old.get(movie.id)!, movie])[0] : movie,
        );
        const combined = mergeImportedCatalogue(
          await verifySearchListings(primary, imports),
          imports,
        );
        const { movies } = await enrichCatalogueReports(
          combined,
          feed.map((entry) => entry.report),
          identities,
          signal,
        );
        const versions = Object.fromEntries(
          movies.map((movie) => [movie.id, rows.get(movie.id)?.updated_at || null]),
        );
        const published = checked(
          await db
            .rpc('a_list_publish_catalogue_versioned', {
              p_movies: movies,
              p_checked_at: new Date().toISOString(),
              p_versions: versions,
            })
            .abortSignal(signal),
        ) as Movie[];
        await remember('catalogue', { movies: published, checkedAt: now }, 300);
        catalogueUpdated = true;
        await recordSourceCheck(db, 'catalogue', true);
        checked(
          await db
            .from('a_list_source_cache')
            .delete()
            .lt('updated_at', new Date(Date.now() - 7 * 86400_000).toISOString())
            .abortSignal(signal),
        );
      } catch {
        failed++;
        await recordSourceCheck(db, 'catalogue', false);
        console.error(JSON.stringify({ event: 'catalogue_refresh_failed' }));
      }
    }
    if (Date.now() - started < 33000) {
      await getFeed();
      const budgetMs = Math.min(10000, 40000 - (Date.now() - started));
      if (budgetMs > 500)
        try {
          const result = await expandReleases(feed, { budgetMs, signal, db });
          if (result.processed) {
            const success = !result.decisions.some((d) =>
              ['source_unavailable', 'budget_exhausted'].includes(d.outcome),
            );
            checks.set('wts_reports', (checks.get('wts_reports') ?? true) && success);
            if (!success) failed++;
          }
        } catch {
          failed++;
          checks.set('wts_reports', false);
          console.warn(JSON.stringify({ event: 'release_expansion_deferred' }));
        }
    }
    for (const [source, success] of checks) await recordSourceCheck(db, source, success);
    const finished = new Date().toISOString();
    checked(
      await db
        .from('a_list_source_status')
        .update({
          ...(catalogueUpdated || refreshed ? { version: randomUUID(), updated_at: finished } : {}),
          ...(failed
            ? { failures: status.failures + failed, last_failure_at: finished }
            : { failures: 0, last_success_at: finished }),
        })
        .eq('id', true)
        .abortSignal(signal),
    );
    if (refreshed)
      try {
        await cache().del('alist:catalogue');
      } catch {
        console.warn(JSON.stringify({ event: 'catalogue_cache_invalidation_failed' }));
      }
    await metric('refresh_failures', failed);
    await metric('refreshed_movies', refreshed);
    const result = { catalogueUpdated, refreshed, failed, durationMs: Date.now() - started };
    console.log(JSON.stringify({ event: 'ingestion_finished', ...result }));
    return result;
  });
}
