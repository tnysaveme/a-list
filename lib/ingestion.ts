import 'server-only';
import { randomUUID } from 'node:crypto';
import { adminDb } from './supabase/admin';
import { checked } from './db-result';
import { withLease, remember, metric, cache } from './infrastructure';
import { mergeMovies, type Movie } from './model';
import { loadCatalogue, type CataloguePartitions } from './release-catalogue';
import { refreshMovie } from './movie-refresh';
import { drainDue } from './work-batches';
import { releaseIdentities, releaseImports } from './release-store';
import { verifySearchListings, enrichCatalogueReports } from './source-verification';
import { mergeImportedCatalogue } from './imported-catalogue';
import { expandReleases, expansionFeed } from './release-expansion';
import { SIX_HOURS, type FeedEntry } from './release-automation';
import { refreshReportLookups } from './release-lookup';
import { recordSourceCheck } from './source-checks';
import { healthTransition, type MonitorState } from './health-transition';
import { sourceHealthSummary, SOURCE_HEALTH_COLUMNS } from './source-health';
import { cached } from './infrastructure';
import { TRANSIENT_RETRY_MS } from './source-health';
import { movieRows } from './movie-rows';
import { ingestionPayload } from './ingestion-state';
import { auditCoverageWhenDue } from './coverage-audit';
import { failedRefreshMovie } from './source-errors';
import {
  indexWtsProfiles,
  indexWtsProfileChanges,
  dueWtsProfiles,
  inventoryEntries,
  checkpointWtsProfiles,
} from './wts-inventory';

export async function refreshSources() {
  return withLease('ingestion', 55, async () => {
    const started = Date.now(),
      signal = AbortSignal.timeout(45000),
      db = adminDb(),
      now = new Date().toISOString();
    const status = checked(
      await db
        .from('a_list_source_status')
        .select(
          'catalogue_success_at,failures,wts_profile_page,wts_profile_after,wts_profile_changes,wts_coverage',
        )
        .eq('id', true)
        .abortSignal(signal)
        .single(),
    );
    if (!status) throw new Error('Source status unavailable');
    const payload = ingestionPayload(db, AbortSignal.any([signal, AbortSignal.timeout(6000)]));
    let identitySnapshot: ReturnType<typeof releaseIdentities> | undefined;
    const identities = (deadline = signal) =>
      (identitySnapshot ??= releaseIdentities(deadline).catch((error) => {
        identitySnapshot = undefined;
        throw error;
      }));
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
      feed: FeedEntry[] = [],
      feedLoaded = false;
    const checks = new Map<string, boolean>();
    const stages: Record<string, number> = {};
    const until = (ms: number) =>
      AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, started + ms - Date.now()))]);
    try {
      const audit = await auditCoverageWhenDue(db, status.wts_coverage, until(2000), started);
      if (audit?.queued)
        console.info(
          JSON.stringify({ event: 'wts_consistency_repair_queued', count: audit.queued }),
        );
    } catch {
      console.warn(JSON.stringify({ event: 'wts_consistency_audit_deferred' }));
    }
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
    const discoveryStarted = Date.now();
    await Promise.allSettled([
      (async () => {
        const discoveries = await Promise.allSettled(
          [indexWtsProfileChanges, indexWtsProfiles].map((discover) =>
            discover(status, db, until(4500)),
          ),
        );
        for (const [index, result] of discoveries.entries())
          if (result.status === 'rejected') {
            checks.set('wts_reports', false);
            console.warn(
              JSON.stringify({
                event: index === 0 ? 'wts_profile_changes_deferred' : 'wts_profile_index_deferred',
              }),
            );
          } else if (result.value) checks.set('wts_reports', checks.get('wts_reports') ?? true);
      })(),
      getFeed(),
    ]);
    stages.discovery = Date.now() - discoveryStarted;
    const savedSignal = until(19000);
    const savedStarted = Date.now();
    type Candidate = { id: string; movie: Movie; refresh_failures: number; updated_at: string };
    // Personal date updates get first use of the existing job, ahead of catalogue expansion.
    try {
      await drainDue<Candidate>(
        async () => {
          const rows = checked(
            await db.rpc('a_list_refresh_candidates', { p_limit: 8 }).abortSignal(savedSignal),
          ) as Candidate[];
          // A metadata-store outage must not be recorded as a provider failure for each film.
          if (rows.length) await identities(savedSignal);
          return rows;
        },
        async (row) => {
          try {
            let partial = false;
            const movie = await refreshMovie(row.movie, {
              identities: await identities(savedSignal),
              signal: savedSignal,
              onSourceResult: (result) => {
                if (!savedSignal.aborted) onSourceResult(result);
                partial ||= !result.success;
              },
            });
            if (savedSignal.aborted) return;
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
                .abortSignal(until(21000)),
            );
            if (saved?.length) {
              refreshed++;
              if (partial) failed++;
            }
          } catch (error) {
            if (savedSignal.aborted) return; // Local deadline is not a source failure.
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
                .abortSignal(until(21000)),
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
        { started, budgetMs: 19000 },
      );
    } catch {
      console.warn(JSON.stringify({ event: 'saved_refresh_deferred' }));
    }
    stages.saved = Date.now() - savedStarted;
    async function getFeed() {
      if (feedLoaded) return;
      feedLoaded = true;
      const snapshot = await payload();
      feed = snapshot.wts_feed;
      try {
        feed = await expansionFeed(snapshot, until(6500), db);
      } catch {
        failed++;
        await recordSourceCheck(db, 'wts_feed', false);
        console.warn(JSON.stringify({ event: 'release_feed_unavailable' }));
      }
    }
    const expansionStarted = Date.now();
    try {
      if (Date.now() - started < 28500) {
        const inventory = await dueWtsProfiles(db, until(22000));
        await getFeed();
        const budgetMs = Math.min(10000, 29000 - (Date.now() - started));
        if (budgetMs > 500)
          try {
            const result = await expandReleases([...feed, ...inventoryEntries(inventory)], {
              budgetMs,
              signal: until(31000),
              db,
              knownMovies: (await payload()).catalogue,
            });
            await checkpointWtsProfiles(inventory, result.decisions, db, until(32000));
            if (result.processed) {
              const success = !result.decisions.some(
                (d) => d.partial || ['source_unavailable', 'budget_exhausted'].includes(d.outcome),
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
    } catch {
      console.warn(JSON.stringify({ event: 'release_work_deferred' }));
    }
    stages.expansion = Date.now() - expansionStarted;
    const catalogueSignal = until(39000);
    const catalogueStarted = Date.now();
    if (
      (!status.catalogue_success_at ||
        Date.now() - Date.parse(status.catalogue_success_at) >= SIX_HOURS) &&
      Date.now() - started < 33000
    ) {
      try {
        // One feed snapshot supplies both enrichment and new-film discovery.
        await getFeed();
        const previous = await payload();
        let partitions: CataloguePartitions = previous.catalogue_partitions;
        const [listing, importRows] = await Promise.all([
          loadCatalogue(new Date(), undefined, undefined, {
            enrichReports: false,
            signal: catalogueSignal,
            previousPartitions: previous.catalogue_partitions,
            previousCatalogue: previous.catalogue,
            onPartitions: (value) => {
              partitions = value;
            },
          }),
          releaseImports(catalogueSignal),
        ]);
        const existing = await movieRows(
          db,
          listing.map((movie) => movie.id),
          catalogueSignal,
        );
        // The version must belong to the exact snapshot used to build each candidate.
        const rows = new Map([...existing, ...importRows].map((row) => [row.id, row]));
        const old = new Map([...rows.values()].map((row) => [row.id, row.movie as Movie]));
        const imports = importRows.map((row) => row.movie);
        const primary = listing.map((movie) =>
          old.has(movie.id) ? mergeMovies([old.get(movie.id)!, movie])[0] : movie,
        );
        const combined = mergeImportedCatalogue(
          await verifySearchListings(primary, imports, catalogueSignal),
          imports,
        );
        const { movies } = await enrichCatalogueReports(
          combined,
          feed.map((entry) => entry.report),
          await identities(catalogueSignal),
          catalogueSignal,
        );
        const versions = Object.fromEntries(
          movies.map((movie) => [movie.id, rows.get(movie.id)?.updated_at || null]),
        );
        const published = checked(
          await db
            .rpc('a_list_publish_catalogue_partitions', {
              p_movies: movies,
              p_checked_at: new Date().toISOString(),
              p_versions: versions,
              p_partitions: partitions,
            })
            .abortSignal(catalogueSignal),
        ) as Movie[];
        await remember('catalogue', { movies: published, checkedAt: now }, 300);
        catalogueUpdated = true;
        await recordSourceCheck(db, 'catalogue', true);
        checked(
          await db
            .from('a_list_source_cache')
            .delete()
            .lt('updated_at', new Date(Date.now() - 7 * 86400_000).toISOString())
            .abortSignal(catalogueSignal),
        );
      } catch {
        failed++;
        await recordSourceCheck(db, 'catalogue', false);
        console.error(JSON.stringify({ event: 'catalogue_refresh_failed' }));
      }
    }
    stages.catalogue = Date.now() - catalogueStarted;
    const lookupStarted = Date.now();
    if (Date.now() - started < 41500) {
      try {
        const lookups = await refreshReportLookups({
          db,
          signal: until(42500),
        });
        failed += lookups.failures;
      } catch {
        failed++;
        console.warn(JSON.stringify({ event: 'saved_report_lookup_deferred' }));
      }
    }
    stages.lookups = Date.now() - lookupStarted;
    await Promise.all(
      [...checks].map(([source, success]) => recordSourceCheck(db, source, success)),
    );
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
    try {
      const healthRow = checked(
        await db
          .from('a_list_source_status')
          .select(SOURCE_HEALTH_COLUMNS)
          .eq('id', true)
          .abortSignal(signal)
          .single(),
      );
      const current = sourceHealthSummary(healthRow || {});
      const previous = await cached<MonitorState>('health:last');
      const transition = healthTransition(previous || undefined, current);
      if (transition) console.info(JSON.stringify(transition));
      await remember('health:last', { status: current.status, issues: current.issues }, 86400);
    } catch {
      console.warn(JSON.stringify({ event: 'health_transition_unavailable' }));
    }
    await metric('refresh_failures', failed);
    await metric('refreshed_movies', refreshed);
    const result = {
      catalogueUpdated,
      refreshed,
      failed,
      durationMs: Date.now() - started,
      stages,
    };
    console.log(JSON.stringify({ event: 'ingestion_finished', ...result }));
    return result;
  });
}
