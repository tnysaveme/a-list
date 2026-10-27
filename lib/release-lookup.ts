import 'server-only';
import { verifiedReleases, type Movie } from './model';
import { verifiedIdentityId, titleKey } from './film-identity';
import {
  fetchSource,
  parseReports,
  parseReportProfiles,
  parseProfileReports,
  text,
} from './sources';
import { profileReference } from './reviewed-report-identities';
import { expandReleases } from './release-expansion';
import { mergeReleaseFeed } from './release-automation';
import { adminDb } from './supabase/admin';
import { checked } from './db-result';
import { cached, remember, withLease } from './infrastructure';
import { recordSourceCheck } from './source-checks';

export type LookupState = { nextCheckAt: string; outcome: LookupOutcome };
export type LookupOutcome =
  'ineligible' | 'cached' | 'busy' | 'matched' | 'no_report' | 'unresolved' | 'source_unavailable';
export type LookupResult = {
  movie: Movie;
  attempted: boolean;
  outcome: LookupOutcome;
  nextCheckAt?: string;
};
export type LookupCache = {
  read: (key: string) => Promise<LookupState | null>;
  write: (key: string, value: LookupState, ttl: number) => Promise<void>;
  lease: <T>(key: string, ttl: number, work: () => Promise<T>) => Promise<T | null>;
};
const sharedCache: LookupCache = { read: cached, write: remember, lease: withLease };
function lookupStatus(movie: Movie, outcome: LookupOutcome): Movie {
  if (outcome === 'unresolved' || outcome === 'source_unavailable')
    return {
      ...movie,
      releaseLookupStatus: outcome === 'unresolved' ? 'unresolved' : 'unavailable',
    };
  return movie.releaseLookupStatus ? { ...movie, releaseLookupStatus: undefined } : movie;
}
export function needsReportLookup(movie: Movie) {
  const releases = verifiedReleases(movie).filter((r) => r.confidence === 'listed');
  return (
    movie.mediaType !== 'series' &&
    !!verifiedIdentityId(movie) &&
    !!movie.year &&
    (!releases.some((r) => r.kind === 'Digital' || r.kind === 'PVOD') ||
      !releases.some((r) => r.kind === 'Subscription'))
  );
}
/** A bounded daily search fills missing windows even when a rental date is already known. */
export async function lookupReleaseReports(
  movie: Movie,
  {
    db = adminDb(),
    signal: parent,
    lookupCache = sharedCache,
    expand = expandReleases,
    budgetMs = 10000,
  }: {
    db?: ReturnType<typeof adminDb>;
    signal?: AbortSignal;
    lookupCache?: LookupCache;
    expand?: typeof expandReleases;
    budgetMs?: number;
  } = {},
): Promise<LookupResult> {
  const id = verifiedIdentityId(movie);
  if (!id || !needsReportLookup(movie)) return { movie, attempted: false, outcome: 'ineligible' };
  const key = `release-lookup:v5:${id}`,
    settleDeadline = Date.now() + budgetMs + 3000,
    own = AbortSignal.timeout(budgetMs),
    signal = parent ? AbortSignal.any([parent, own]) : own;
  let attempted = false,
    value = movie;
  const cachedResult = (state: LookupState): LookupResult => ({
    movie: lookupStatus(movie, state.outcome),
    attempted: false,
    outcome: 'cached',
    nextCheckAt: state.nextCheckAt,
  });
  const complete = async (
    outcome: LookupOutcome,
    value = movie,
    retry = false,
  ): Promise<LookupResult> => {
    const ttl = retry ? 600 : 86400,
      nextCheckAt = new Date(Date.now() + ttl * 1000).toISOString();
    await lookupCache.write(key, { outcome, nextCheckAt }, ttl);
    return { movie: lookupStatus(value, outcome), attempted, outcome, nextCheckAt };
  };
  try {
    const hit = await lookupCache.read(key);
    if (hit && Date.parse(hit.nextCheckAt) > Date.now()) return cachedResult(hit);
    const found = await lookupCache.lease(key, 20, async () => {
      const again = await lookupCache.read(key);
      if (again && Date.parse(again.nextCheckAt) > Date.now()) return cachedResult(again);
      if (signal.aborted) return { movie, attempted: false, outcome: 'busy' as const };
      attempted = true;
      const xml = await fetchSource(
        `https://whentostream.com/feed/?s=${encodeURIComponent(movie.title.slice(0, 160))}`,
        { signal },
      );
      if (!/<rss\b/i.test(xml) || !/<channel\b/i.test(xml) || !/<\/channel>/i.test(xml))
        throw new Error('Release feed format changed');
      const sourcePages = new Map<string, string>();
      const profiles = await Promise.allSettled(
        parseReportProfiles(xml, movie).map(async (candidate) => {
          const html = await fetchSource(candidate.source, { signal, cache: 'no-store' });
          const reference = profileReference(html, candidate.title, text);
          if (!reference || reference.sourceFilmUrl !== candidate.source)
            throw new Error('Source film identity changed');
          sourcePages.set(candidate.source, html);
          return parseProfileReports(html, reference);
        }),
      );
      // Native profiles come first. Announcements fill only windows still missing after verification.
      const window = (kind: string) => (kind === 'PVOD' ? 'Digital' : kind);
      let remaining = 2,
        matched = 0,
        processed = false;
      let retry = profiles.some((result) => result.status === 'rejected');
      for (const reports of [
        profiles.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])),
        parseReports(xml),
      ]) {
        const known = new Set(
          verifiedReleases(value)
            .filter((r) => r.confidence === 'listed' || sourcePages.has(r.source))
            .map((r) => window(r.kind)),
        );
        const selected = reports.filter(
          (report) =>
            titleKey(report.title) === titleKey(movie.title) &&
            (!report.year ||
              report.year === movie.year ||
              sourcePages.has(report.release.source)) &&
            !known.has(window(report.release.kind)),
        );
        const feed = mergeReleaseFeed([], selected, new Date().toISOString()).slice(0, remaining);
        if (!feed.length) continue;
        if (signal.aborted) {
          retry = true;
          break;
        }
        processed = true;
        remaining -= feed.length;
        const result = await expand(feed, {
          db,
          signal,
          limit: feed.length,
          budgetMs,
          checkpoint: false,
          expectedImdbId: id,
          sourcePages,
        });
        retry ||= result.decisions.some(
          (d) =>
            d.partial ||
            ['source_unavailable', 'budget_exhausted', 'imports_paused'].includes(d.outcome),
        );
        matched += result.matched;
        if (result.matched) {
          // One shared settling deadline bounds reads after a completed publication.
          const settle = AbortSignal.timeout(Math.max(1, settleDeadline - Date.now()));
          const readSignal = parent ? AbortSignal.any([parent, settle]) : settle;
          const row = checked(
            await db
              .from('a_list_movies')
              .select('movie')
              .eq('id', movie.id)
              .abortSignal(readSignal)
              .maybeSingle(),
          );
          value = (row?.movie as Movie) || value;
        }
        if (!remaining) break;
      }
      return complete(
        retry ? 'source_unavailable' : matched ? 'matched' : processed ? 'unresolved' : 'no_report',
        value,
        retry,
      );
    });
    return found || { movie, attempted: false, outcome: 'busy' };
  } catch {
    console.warn(JSON.stringify({ event: 'release_lookup_deferred' }));
    if (!attempted) return { movie, attempted: false, outcome: 'busy' };
    return complete('source_unavailable', value, true);
  }
}
export async function lookupMovieReports(
  movie: Movie,
  options: Parameters<typeof lookupReleaseReports>[1] = {},
): Promise<Movie> {
  return (await lookupReleaseReports(movie, options)).movie;
}

/** Scan a bounded due batch; cached or busy films do not consume the single source request. */
export async function refreshReportLookups({
  db = adminDb(),
  signal,
  lookup = lookupReleaseReports,
}: {
  db?: ReturnType<typeof adminDb>;
  signal: AbortSignal;
  lookup?: typeof lookupReleaseReports;
}) {
  const rows = checked(
    await db.rpc('a_list_report_lookup_candidates', { p_limit: 8 }).abortSignal(signal),
  ) as { id: string; movie: Movie }[];
  let scanned = 0,
    attempts = 0,
    failures = 0;
  for (const row of rows) {
    if (signal.aborted) break;
    const result = await lookup(row.movie, { db, signal });
    scanned++;
    if (result.nextCheckAt || result.outcome === 'ineligible')
      checked(
        await db
          .from('a_list_movies')
          .update({
            report_lookup_after:
              result.nextCheckAt || new Date(Date.now() + 86400_000).toISOString(),
          })
          .eq('id', row.id)
          .abortSignal(signal),
      );
    if (!result.attempted) continue;
    attempts++;
    failures += Number(result.outcome === 'source_unavailable');
    await recordSourceCheck(db, 'wts_lookup', !failures);
    break;
  }
  return { scanned, attempts, failures };
}
