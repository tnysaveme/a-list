import { releaseDay } from './release-day';
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeDeadline } from './request-deadline';
import { interactiveResult } from './interactive-refresh';
import { versionedCache } from './versioned-cache';
import { movieCard } from './catalogue-view';
import { sharedSearch } from './shared-search';
import { getDb } from '../db';
import type { AccountRow, LibraryRow } from '../db/schema';
import snapshot from './catalogue.json';
import { releaseCheckDue, sanitizeMovie, type Movie } from './model';
import { filmIndex } from './film-identity';
import { canonicalSearchMovie } from './search-canonical';
import { adminDb } from './supabase/admin';
import { cached, remember, privateKey, withLease, metric, cache } from './infrastructure';
import type { LibraryPage } from './pagination';
import { CALENDAR_FORMAT_UPDATED_AT, makeCalendar } from './calendar';
import { feedDocument, type FeedDocument } from './feed-cache';
import { after } from 'next/server';
import { searchProviders } from './movie-search';
import { refreshMovie } from './movie-refresh';
import { writeLibrary } from './library-mutations';
import { checked } from './db-result';
import { releaseIdentities } from './release-store';
import { lookupReleaseReports } from './release-lookup';
import { TRANSIENT_RETRY_MS } from './source-health';
import { recordSourceCheck } from './source-checks';
import { cataloguePage, type CatalogueOptions, type CataloguePage } from './catalogue-view';
import { failedRefreshMovie } from './source-errors';
export type DataContext = { db: SupabaseClient; userId: string };
export async function context(userId: string): Promise<DataContext> {
  return { db: await getDb(), userId };
}
export async function membership(
  ctx: DataContext,
  movies: Movie[],
  signal = AbortSignal.timeout(3000),
): Promise<Movie[]> {
  if (!movies.length) return [];
  const rows = checked(
    await ctx.db
      .from('a_list_library')
      .select('movie_id,tracked,added_at,watched_at')
      .eq('user_id', ctx.userId)
      .in(
        'movie_id',
        movies.map((m) => m.id),
      )
      .abortSignal(signal),
  ) as Pick<LibraryRow, 'movie_id' | 'tracked' | 'added_at' | 'watched_at'>[];
  const saved = new Map(rows.map((r) => [r.movie_id, r]));
  return movies.map((m) => ({
    ...sanitizeMovie(m),
    saved: saved.has(m.id),
    tracked: saved.get(m.id)?.tracked || false,
    addedAt: saved.get(m.id)?.added_at,
    watchedAt: saved.get(m.id)?.watched_at || null,
  }));
}
type Catalogue = { movies: Movie[]; checkedAt: string | null; provenance?: 'live' | 'fallback' };
async function sharedCatalogue(ctx: DataContext): Promise<Catalogue> {
  let result: Catalogue;
  try {
    result = await versionedCache<Catalogue>('catalogue:v2', {
      version: async () =>
        String(
          checked(
            await ctx.db
              .from('a_list_source_status')
              .select('catalogue_version')
              .eq('id', true)
              .abortSignal(AbortSignal.timeout(1500))
              .single(),
          )!.catalogue_version,
        ),
      read: cached,
      lease: (key, work) => withLease(key, 15, work),
      load: async () => {
        const row = checked(
          await ctx.db.rpc('a_list_catalogue_snapshot').abortSignal(AbortSignal.timeout(3000)),
        ) as Catalogue;
        if (!row) throw new Error('Catalogue unavailable');
        return {
          ...row,
          movies: (row.movies.length ? row.movies : (snapshot as Movie[])).map(movieCard),
        };
      },
      write: async (key, value) => {
        await Promise.all([
          remember(key, value, 300),
          remember('catalogue:last-good:v2', value, 86400),
        ]);
      },
    });
  } catch (error) {
    const previous = await cached<Catalogue>('catalogue:last-good:v2');
    if (!previous) throw error;
    result = { ...previous, provenance: 'fallback' };
  }
  return { ...result, movies: result.movies.filter((movie) => movie.mediaType !== 'series') };
}

export async function getCatalogue(
  ctx: DataContext,
  options: CatalogueOptions = {},
): Promise<CataloguePage> {
  const result = await sharedCatalogue(ctx),
    day = releaseDay();
  const page = cataloguePage(result.movies, options, day);
  // The shared SQL snapshot omits synopses. Restore only this page's stored text
  // so both collections can render the same preview without requests on hover.
  const missing = page.movies.filter((movie) => !movie.overview);
  const readSynopses = async (): Promise<{ id: string; overview: string | null }[]> => {
    if (!missing.length) return [];
    try {
      return checked(
        await ctx.db
          .from('a_list_movies')
          .select('id,overview:movie->>overview')
          .in(
            'id',
            missing.map((movie) => movie.id),
          )
          .abortSignal(AbortSignal.timeout(1500)),
      ) as { id: string; overview: string | null }[];
    } catch {
      // Release browsing remains usable when optional synopsis reads fail.
      after(() => metric('catalogue_preview_unavailable'));
      return [];
    }
  };
  const [personal, rows] = await Promise.all([membership(ctx, page.movies), readSynopses()]);
  const synopses = new Map(
    (rows || []).filter((row) => row.overview).map((row) => [row.id, row.overview!.slice(0, 320)]),
  );
  const movies = personal.map((movie) =>
    synopses.has(movie.id) ? { ...movie, overview: synopses.get(movie.id) } : movie,
  );
  return {
    ...page,
    movies,
    checkedAt: result.checkedAt,
    provenance: result.provenance || (result.checkedAt ? 'live' : 'fallback'),
    stale:
      result.provenance === 'fallback' ||
      !result.checkedAt ||
      Date.now() - Date.parse(result.checkedAt) > 7 * 3600_000,
  };
}
async function searchUpstream(
  ctx: DataContext,
  query: string,
  signal: AbortSignal,
): Promise<Movie[]> {
  const key = `search:v6:${privateKey(query.trim().toLowerCase())}`;
  const found = await sharedSearch<Movie[]>(key, {
    read: () => cached<Movie[]>(key),
    lease: (work) => withLease(key, 20, work),
    load: async () => {
      const { movies, metadata, degraded } = await searchProviders(query, 4500, signal);
      // Keep existing stable IDs when a previously linked film is returned only by metadata.
      if (metadata.length) {
        const linked =
          checked(
            await adminDb()
              .from('a_list_movies')
              .select('id,movie')
              .in(
                'movie->>imdbId',
                metadata.map((m) => m.id),
              )
              .abortSignal(signal),
          ) || [];
        const index = filmIndex(linked.map((row) => row.movie as Movie));
        for (let i = 0; i < movies.length; i++) {
          const decision = index.resolve(movies[i]);
          if (decision.status === 'matched')
            movies[i] = canonicalSearchMovie(movies[i], decision.candidates[0]);
        }
      }
      const unique = [...new Map(movies.map((m) => [m.id, m])).values()];
      // Search hits stay saveable, but only opening or saving requests a refresh.
      if (unique.length)
        checked(
          await adminDb()
            .from('a_list_movies')
            .upsert(
              unique.map((movie) => ({ id: movie.id, movie })),
              { onConflict: 'id', ignoreDuplicates: true },
            )
            .abortSignal(signal),
        );
      await remember(key, unique, degraded ? 60 : 3600);
      return unique;
    },
  });
  if (!found.length) return [];
  const fresh =
    checked(
      await ctx.db
        .from('a_list_movies')
        .select('id,movie')
        .in(
          'id',
          found.map((m) => m.id),
        )
        .abortSignal(signal),
    ) || [];
  const canonical = new Map(fresh.map((r) => [r.id, r.movie as Movie]));
  return found
    .map((m) => {
      const current = canonical.get(m.id);
      return current ? canonicalSearchMovie(m, current) : m;
    })
    .filter((movie) => movie.mediaType !== 'series');
}
export async function searchMovies(
  ctx: DataContext,
  query: string,
  parent?: AbortSignal,
  budgetMs = 6500,
): Promise<Movie[]> {
  const own = AbortSignal.timeout(Math.max(1, budgetMs - 750));
  const signal = parent ? AbortSignal.any([parent, own]) : own;
  const [remote, local] = await Promise.allSettled([
    beforeDeadline(searchUpstream(ctx, query, signal), signal),
    beforeDeadline(sharedCatalogue(ctx), signal),
  ]);
  const term = query.trim().toLowerCase(),
    catalogue =
      local.status === 'fulfilled'
        ? local.value.movies.filter((movie) => movie.title.toLowerCase().includes(term))
        : [];
  if (remote.status === 'rejected' && !catalogue.length) throw remote.reason;
  const results = remote.status === 'fulfilled' ? remote.value : [],
    ids = new Set(results.map((movie) => movie.id));
  return membership(
    ctx,
    [...results, ...catalogue.filter((movie) => !ids.has(movie.id))].slice(0, 24),
    parent || AbortSignal.timeout(750),
  );
}
export async function getMovie(
  ctx: DataContext,
  id: string,
  cachedOnly = false,
): Promise<Movie | null> {
  const row = checked(
    await ctx.db.from('a_list_movies').select('movie').eq('id', id).maybeSingle(),
  );
  if (!row) return null;
  const baseline = row.movie as Movie;
  if (cachedOnly) {
    const pending = await cached<string>(`lock:detail:${id}`);
    return (await membership(ctx, [{ ...baseline, refreshPending: !!pending }]))[0];
  }
  const work = withLease(`detail:${id}`, 45, () => refreshStoredMovie(ctx, id));
  // Keep the background promise registered with Next even after the interactive wait ends.
  after(async () => {
    try {
      await work;
    } catch {
      console.warn(JSON.stringify({ event: 'detail_refresh_deferred', movieId: id }));
    }
  });
  let result;
  try {
    result = await interactiveResult(work, 1500);
  } catch {
    return (
      await membership(ctx, [
        { ...baseline, releaseLookupStatus: 'unavailable', refreshPending: false },
      ])
    )[0];
  }
  if (result.ready && result.value) return { ...result.value, refreshPending: false };
  return (await membership(ctx, [{ ...baseline, refreshPending: true }]))[0];
}
async function refreshStoredMovie(ctx: DataContext, id: string): Promise<Movie | null> {
  const row = checked(
    await ctx.db
      .from('a_list_movies')
      .select('movie,refresh_after,requested_at,updated_at')
      .eq('id', id)
      .maybeSingle(),
  );
  if (!row) return null;
  let movie = row.movie as Movie;
  const releasesDue = releaseCheckDue(movie) && Date.parse(row.refresh_after) <= Date.now();
  if (
    releasesDue ||
    ((!movie.overview || (movie.imdbId && !movie.synopsisCheckedAt)) &&
      (!movie.synopsisCheckedAt || Date.now() - Date.parse(movie.synopsisCheckedAt) > 3600_000))
  ) {
    try {
      const refreshed = await withLease(`movie:${id}`, 40, async () => {
        const identities = movie.releases.some((release) => release.sourceName === 'When To Stream')
          ? await releaseIdentities()
          : undefined;
        let partial = false;
        const checks: { source: 'primary' | 'wts'; success: boolean }[] = [];
        let value: Movie;
        try {
          value = await refreshMovie(movie, {
            discoverReleases: releasesDue,
            identities,
            onSourceResult: (result) => {
              partial ||= !result.success;
              checks.push(result);
            },
          });
        } finally {
          for (const result of checks)
            await recordSourceCheck(
              adminDb(),
              result.source === 'wts' ? 'wts_reports' : 'primary',
              result.success,
            );
        }
        const saved = checked(
          await adminDb()
            .from('a_list_movies')
            .update({
              movie: value,
              updated_at: new Date().toISOString(),
              ...(releasesDue
                ? {
                    refresh_after: new Date(
                      Date.now() + (partial ? TRANSIENT_RETRY_MS : 6 * 3600_000),
                    ).toISOString(),
                    requested_at: null,
                    refresh_failures: partial ? 1 : 0,
                  }
                : {}),
            })
            .eq('id', id)
            .eq('updated_at', row.updated_at)
            .select('movie')
            .maybeSingle(),
        );
        if (saved && releasesDue)
          try {
            await cache().del('alist:catalogue');
          } catch {
            console.warn(JSON.stringify({ event: 'catalogue_cache_invalidation_failed' }));
          }
        return saved?.movie as Movie | undefined;
      });
      if (refreshed) movie = refreshed;
    } catch (error) {
      if (releasesDue) {
        movie = failedRefreshMovie(movie, error);
        checked(
          await adminDb()
            .from('a_list_movies')
            .update({
              movie,
              updated_at: new Date().toISOString(),
              refresh_failures: 1,
              refresh_after: new Date(Date.now() + TRANSIENT_RETRY_MS).toISOString(),
            })
            .eq('id', id)
            .eq('updated_at', row.updated_at),
        );
      }
      console.warn(
        JSON.stringify({
          event: releasesDue ? 'film_refresh_failed' : 'synopsis_refresh_failed',
          movieId: id,
          issues: movie.releaseCheck?.issues,
        }),
      );
    }
  }
  if (
    !row.requested_at &&
    !releasesDue &&
    Date.parse(row.refresh_after) <= Date.now() &&
    !movie.overview
  ) {
    checked(
      await adminDb()
        .from('a_list_movies')
        .update({ requested_at: new Date().toISOString(), refresh_after: new Date().toISOString() })
        .eq('id', id)
        .is('requested_at', null),
    );
  }
  const lookup = await lookupReleaseReports(movie);
  movie = lookup.movie;
  if (lookup.attempted) {
    if (lookup.nextCheckAt)
      checked(
        await adminDb()
          .from('a_list_movies')
          .update({ report_lookup_after: lookup.nextCheckAt })
          .eq('id', id),
      );
    await recordSourceCheck(adminDb(), 'wts_lookup', lookup.outcome !== 'source_unavailable');
  }
  return (await membership(ctx, [movie]))[0];
}
export async function account(ctx: DataContext, signal?: AbortSignal): Promise<AccountRow> {
  const read = () =>
    ctx.db
      .from('a_list_accounts')
      .select('id,feed_token,include_rumors')
      .eq('id', ctx.userId)
      .abortSignal(signal || AbortSignal.timeout(10000))
      .maybeSingle();
  const existing = checked(await read());
  if (existing) return existing as AccountRow;
  checked(
    await ctx.db
      .from('a_list_accounts')
      .upsert({ id: ctx.userId }, { onConflict: 'id', ignoreDuplicates: true })
      .abortSignal(signal || AbortSignal.timeout(10000)),
  );
  const created = checked(await read());
  if (!created) throw new Error('Account initialization did not complete');
  return created as AccountRow;
}
export async function getLibraryPage(
  ctx: DataContext,
  options: {
    sort?: string;
    filter?: string;
    offset?: number;
    limit?: number;
    tracked?: boolean;
  } = {},
  signal?: AbortSignal,
): Promise<LibraryPage> {
  const limit = options.limit || 25,
    offset = options.offset || 0;
  const page = checked(
    await ctx.db
      .rpc('a_list_library_page', {
        p_sort: options.sort || 'release',
        p_filter: options.filter || 'all',
        p_offset: offset,
        p_limit: limit,
        p_tracked: !!options.tracked,
      })
      .abortSignal(signal || AbortSignal.timeout(10000)),
  ) as Omit<LibraryPage, 'nextOffset'>;
  return {
    ...page,
    movies: page.movies.map(sanitizeMovie),
    weekReleases: page.weekReleases?.map((entry) => ({
      ...entry,
      movie: sanitizeMovie(entry.movie),
    })),
    nextOffset:
      offset + page.movies.length < page.filteredTotal ? offset + page.movies.length : null,
  };
}
export async function updateLibrary(
  ctx: DataContext,
  action: string,
  ids: string[],
  restored?: Record<string, string | null>,
) {
  await writeLibrary(ctx.db, ctx.userId, action, ids, restored);
}
export async function updateSettings(ctx: DataContext, includeRumors: boolean) {
  checked(
    await ctx.db
      .from('a_list_accounts')
      .upsert({ id: ctx.userId, include_rumors: includeRumors }, { onConflict: 'id' }),
  );
}
type FeedState = {
  revision: string;
  sourcesVersion: string;
  modifiedAt: string;
  includeRumors: boolean;
};
export async function getCalendarFeed(token: string): Promise<FeedDocument | null> {
  const db = await getDb();
  // Authorize every request, including cache hits, and avoid caching across concurrent edits.
  for (let attempt = 0; attempt < 2; attempt++) {
    const state = checked(
      await db.rpc('a_list_calendar_state', { p_token: token }),
    ) as FeedState | null;
    if (!state) return null;
    const key = `feed:content-v1:${CALENDAR_FORMAT_UPDATED_AT}:${privateKey(token)}:${state.revision}:${state.sourcesVersion}`;
    const hit = await cached<FeedDocument>(key);
    if (hit) {
      after(() => metric('feed_cache_hit'));
      return hit;
    }
    const feed = checked(await db.rpc('a_list_calendar_feed', { p_token: token })) as {
      movies: Movie[];
      includeRumors: boolean;
    } | null;
    if (!feed) return null;
    const currentState = checked(
      await db.rpc('a_list_calendar_state', { p_token: token }),
    ) as FeedState | null;
    if (!currentState) return null;
    if (
      currentState.revision !== state.revision ||
      currentState.sourcesVersion !== state.sourcesVersion
    )
      continue;
    const modifiedAt = new Date(
      Math.max(Date.parse(state.modifiedAt), Date.parse(CALENDAR_FORMAT_UPDATED_AT)),
    ).toISOString();
    const document = feedDocument(
      makeCalendar(feed.movies, { includeRumors: feed.includeRumors, now: new Date(modifiedAt) }),
      modifiedAt,
    );
    if (Buffer.byteLength(document.body) < 2_000_000) await remember(key, document, 3600);
    after(() => metric('feed_cache_miss'));
    return document;
  }
  throw new Error('Calendar changed during refresh; retry');
}

/** One bounded private bootstrap for server rendering and the explicit init retry. */
export async function initializeLibrary(ctx: DataContext, signal = AbortSignal.timeout(10000)) {
  const [owner, page] = await Promise.all([account(ctx, signal), getLibraryPage(ctx, {}, signal)]);
  return {
    ...page,
    feedPath: `/api/feed/${owner.feed_token}.ics`,
    includeRumors: owner.include_rumors,
    feedPublic: true,
  };
}
