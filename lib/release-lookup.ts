import 'server-only';
import { verifiedReleases, type Movie, type Release } from './model';
import { verifiedIdentityId } from './film-identity';
import {
  fetchSource,
  parseReports,
  parseReportProfiles,
  parseProfileReports,
  text,
  parseDetail,
} from './sources';
import { assertListingSource } from './source-identity';
import { profileReference } from './reviewed-report-identities';
import { expandReleases } from './release-expansion';
import { mergeReleaseFeed } from './release-automation';
import { adminDb } from './supabase/admin';
import { checked } from './db-result';
import { cached, remember, withLease } from './infrastructure';
import { recordSourceCheck } from './source-checks';
import { sameReleaseTitle } from './release-evidence';
import { releaseDiagnostic, type ReleaseStage } from './release-diagnostics';

export type LookupState = {
  nextCheckAt: string;
  outcome: LookupOutcome;
  knownKinds?: Release['kind'][];
};
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
    (!!verifiedIdentityId(movie) || /^\d{1,8}$/.test(movie.id)) &&
    (!releases.some((r) => r.kind === 'Digital' || r.kind === 'PVOD') ||
      !releases.some((r) => r.kind === 'Subscription'))
  );
}
export function lookupCadence(movie: Movie, saved: boolean, misses: number, now = Date.now()) {
  const recent =
    Number(movie.year) >= new Date(now).getUTCFullYear() ||
    movie.releases.some((release) => Date.parse(release.date) >= now - 90 * 86400_000);
  return saved || recent ? 86400 : Math.min(7, 2 ** Math.min(3, misses + 1)) * 86400;
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
  if (!needsReportLookup(movie)) return { movie, attempted: false, outcome: 'ineligible' };
  const started = Date.now(),
    settleDeadline = started + budgetMs + 3000,
    own = AbortSignal.timeout(budgetMs),
    signal = parent ? AbortSignal.any([parent, own]) : own;
  if (!verifiedIdentityId(movie)) {
    try {
      assertListingSource(movie);
      const verified = await lookupCache.lease(`release-identity:${movie.id}`, 20, async () => {
        const row = checked(
          await db
            .from('a_list_movies')
            .select('movie,updated_at')
            .eq('id', movie.id)
            .abortSignal(signal)
            .maybeSingle(),
        );
        if (!row) throw new Error('Film not found');
        const current = row.movie as Movie;
        if (verifiedIdentityId(current)) return current;
        assertListingSource(current);
        const fresh = parseDetail(
          await fetchSource(current.source, { signal, cache: 'no-store' }),
          current,
        );
        if (!verifiedIdentityId(fresh)) throw new Error('Native film identity unavailable');
        const saved = checked(
          await db
            .from('a_list_movies')
            .update({ movie: fresh, updated_at: new Date().toISOString() })
            .eq('id', current.id)
            .eq('updated_at', row.updated_at)
            .select('movie')
            .abortSignal(signal)
            .maybeSingle(),
        );
        if (!saved) throw new Error('Catalogue changed; retry');
        return saved.movie as Movie;
      });
      if (!verified) return { movie, attempted: false, outcome: 'busy' };
      movie = verified;
    } catch {
      return {
        movie: lookupStatus(movie, 'source_unavailable'),
        attempted: true,
        outcome: 'source_unavailable',
        nextCheckAt: new Date(Date.now() + 600_000).toISOString(),
      };
    }
  }
  const id = verifiedIdentityId(movie);
  if (!id || !needsReportLookup(movie)) return { movie, attempted: false, outcome: 'ineligible' };
  const context = checked(
    await db.rpc('a_list_report_lookup_context', { p_id: id }).abortSignal(signal),
  ) as {
    saved?: boolean;
    misses?: number;
    revision?: string;
    profiles?: { source: string; title: string }[];
  } | null;
  const key = `release-lookup:v13:${id}:${context?.revision || 'unindexed'}:${context?.saved ? 'saved' : 'public'}`;
  const usable = (state: LookupState) =>
    Date.parse(state.nextCheckAt) > Date.now() &&
    (state.knownKinds || []).every((kind) =>
      verifiedReleases(movie).some((release) => release.kind === kind),
    );
  let attempted = false,
    value = movie;
  let stage: ReleaseStage = 'database';
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
    const ttl = retry
        ? 600
        : outcome === 'no_report' || outcome === 'unresolved'
          ? lookupCadence(movie, !!context?.saved, context?.misses || 0)
          : 86400,
      nextCheckAt = new Date(Date.now() + ttl * 1000).toISOString();
    await lookupCache.write(
      key,
      {
        outcome,
        nextCheckAt,
        knownKinds: [...new Set(verifiedReleases(value).map((r) => r.kind))],
      },
      ttl,
    );
    return { movie: lookupStatus(value, outcome), attempted, outcome, nextCheckAt };
  };
  try {
    const hit = await lookupCache.read(key);
    if (hit && usable(hit)) return cachedResult(hit);
    const found = await lookupCache.lease(key, 20, async () => {
      const again = await lookupCache.read(key);
      if (again && usable(again)) return cachedResult(again);
      if (signal.aborted) return { movie, attempted: false, outcome: 'busy' as const };
      attempted = true;
      stage = 'profile';
      const indexed = context?.profiles?.slice(0, 2) || [];
      let xml = indexed.length
        ? '<rss><channel></channel></rss>'
        : await fetchSource(
            `https://whentostream.com/feed/?s=${encodeURIComponent(movie.title.slice(0, 160))}`,
            { signal, cache: 'no-store' },
          );
      if (!/<rss\b/i.test(xml) || !/<channel\b/i.test(xml) || !/<\/channel>/i.test(xml))
        throw new Error('Release feed format changed');
      const sourcePages = new Map<string, string>();
      const profiles = await Promise.allSettled(
        (indexed.length ? indexed : parseReportProfiles(xml, movie)).map(async (candidate) => {
          const html = await fetchSource(candidate.source, { signal, cache: 'no-store' });
          const reference = profileReference(html, candidate.title, text);
          if (!reference || reference.sourceFilmUrl !== candidate.source)
            throw new Error('Source film identity changed');
          sourcePages.set(candidate.source, html);
          return parseProfileReports(html, reference);
        }),
      );
      const unavailable = profiles.find((result) => result.status === 'rejected');
      if (unavailable?.status === 'rejected')
        console.warn(
          JSON.stringify({
            event: 'release_lookup_profile_deferred',
            movieId: movie.id,
            ...releaseDiagnostic(
              unavailable.reason,
              'profile',
              Date.now() - started,
              signal.aborted,
            ),
          }),
        );
      // Native profiles come first. Announcements fill only windows still missing after verification.
      const window = (kind: string) => (kind === 'PVOD' ? 'Digital' : kind);
      let remaining = 2,
        matched = 0,
        processed = false;
      let retry = profiles.some((result) => result.status === 'rejected');
      for (const phase of ['profiles', 'articles']) {
        if (
          phase === 'articles' &&
          indexed.length &&
          needsReportLookup(value) &&
          remaining &&
          !signal.aborted
        ) {
          xml = await fetchSource(
            `https://whentostream.com/feed/?s=${encodeURIComponent(movie.title.slice(0, 160))}`,
            { signal, cache: 'no-store' },
          );
          if (!/<rss\b/i.test(xml) || !/<channel\b/i.test(xml) || !/<\/channel>/i.test(xml))
            throw new Error('Release feed format changed');
        }
        const reports =
          phase === 'profiles'
            ? profiles.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
            : parseReports(xml, movie);
        const known = new Set(
          verifiedReleases(value)
            .filter((r) => r.confidence === 'listed' || sourcePages.has(r.source))
            .map((r) => window(r.kind)),
        );
        const selected = reports.filter(
          (report) =>
            sameReleaseTitle(report.title, movie.title) &&
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
        stage = 'identity';
        const result = await expand(feed, {
          db,
          signal,
          limit: feed.length,
          budgetMs,
          checkpoint: false,
          expectedImdbId: id,
          expectedMovie: movie,
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
          stage = 'database';
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
        stage = 'profile';
        if (!remaining) break;
      }
      return complete(
        retry ? 'source_unavailable' : matched ? 'matched' : processed ? 'unresolved' : 'no_report',
        value,
        retry,
      );
    });
    return found || { movie, attempted: false, outcome: 'busy' };
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'release_lookup_deferred',
        movieId: movie.id,
        ...releaseDiagnostic(error, stage, Date.now() - started, signal.aborted),
      }),
    );
    if (!attempted) return { movie, attempted: false, outcome: 'busy' };
    return complete('source_unavailable', value, true);
  }
}
/** The existing scheduled job sweeps the catalogue, with two concurrent source lookups at most. */
export async function refreshReportLookups({
  db = adminDb(),
  signal,
  lookup = lookupReleaseReports,
}: {
  db?: ReturnType<typeof adminDb>;
  signal: AbortSignal;
  lookup?: typeof lookupReleaseReports;
}) {
  const candidates = checked(
    await db.rpc('a_list_report_lookup_candidates', { p_limit: 8 }).abortSignal(signal),
  ) as { id: string; movie: Movie }[];
  const rows = [
    ...new Map(candidates.map((row) => [verifiedIdentityId(row.movie) || row.id, row])).values(),
  ];
  let scanned = 0,
    attempts = 0,
    failures = 0;
  for (let offset = 0; offset < rows.length; offset += 2) {
    if (signal.aborted) break;
    const results = await Promise.allSettled(
      rows.slice(offset, offset + 2).map(async (row) => {
        const result = await lookup(row.movie, { db, signal });
        scanned++;
        if (result.nextCheckAt || result.outcome === 'ineligible')
          checked(
            await db
              .rpc('a_list_checkpoint_report_lookup', {
                p_id: row.id,
                p_after: result.nextCheckAt || new Date(Date.now() + 86400_000).toISOString(),
                p_missed:
                  result.outcome === 'cached'
                    ? null
                    : result.outcome === 'no_report' || result.outcome === 'unresolved',
              })
              .abortSignal(signal),
          );
        if (!result.attempted) return;
        attempts++;
        failures += Number(result.outcome === 'source_unavailable');
      }),
    );
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  }
  if (attempts) await recordSourceCheck(db, 'wts_lookup', !failures);
  return { scanned, attempts, failures };
}
