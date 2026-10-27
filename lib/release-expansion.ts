import 'server-only';
import { adminDb } from './supabase/admin';
import { checked } from './db-result';
import {
  fetchSource,
  parseReports,
  parseSearchResults,
  parseDetail,
  parseVerifiedReport,
  profileReleaseEvidence,
  text,
} from './sources';
import { structuredFilmIdentity } from './source-identity';
import {
  reportReference,
  profileReference,
  reviewedReportIdentities,
  type ReviewedReportIdentity,
} from './reviewed-report-identities';
import {
  parseSourceProfile,
  profileFingerprint,
  SourceProfileConflict,
  type SourceProfile,
} from './release-profile';
import { getMetadataEvidence, searchMetadata, type MetadataEvidence } from './metadata';
import { titleKey, verifiedIdentityId } from './film-identity';
import {
  automaticEvidence,
  cachedIdentity,
  inferredIdentity,
  expansionMovie,
  mergeReleaseFeed,
  dueReleaseEntries,
  SIX_HOURS,
  MATCH_RULE_VERSION,
  UnresolvedRelease,
  type FeedEntry,
  type MatchRow,
} from './release-automation';
import { invalidateReleaseCaches } from './release-store';
import { mergeMovies, type Movie } from './model';
import { recordSourceCheck } from './source-checks';
import { TRANSIENT_RETRY_MS } from './source-health';

type Db = ReturnType<typeof adminDb>;
export type ReleaseFeedState = { wts_feed?: FeedEntry[]; wts_feed_after?: string | null };
export async function expansionFeed(
  state: ReleaseFeedState,
  signal: AbortSignal,
  db = adminDb(),
): Promise<FeedEntry[]> {
  const previous = state.wts_feed || [];
  if (state.wts_feed_after && Date.parse(state.wts_feed_after) > Date.now()) return previous;
  const results = await Promise.allSettled(
    ['https://whentostream.com/feed/', 'https://whentostream.com/feed/?paged=2'].map(
      async (url) => {
        const xml = await fetchSource(url, { cache: 'no-store', signal });
        if (!/<rss\b/i.test(xml) || !/<channel\b/i.test(xml) || !/<\/channel>/i.test(xml))
          throw new Error('Release feed format changed');
        return xml;
      },
    ),
  );
  const good = results.flatMap((result) =>
      result.status === 'fulfilled' ? parseReports(result.value) : [],
    ),
    available = results.some((result) => result.status === 'fulfilled');
  const feed = available ? mergeReleaseFeed(previous, good, new Date().toISOString()) : previous;
  // A partial feed is retried sooner; it never erases the other page's work.
  const delay = results.every((result) => result.status === 'fulfilled') ? SIX_HOURS : 15 * 60_000;
  checked(
    await db
      .from('a_list_source_status')
      .update({ wts_feed: feed, wts_feed_after: new Date(Date.now() + delay).toISOString() })
      .eq('id', true)
      .abortSignal(signal),
  );
  await recordSourceCheck(
    db,
    'wts_feed',
    results.every((result) => result.status === 'fulfilled'),
  );
  if (!available) console.warn(JSON.stringify({ event: 'release_feed_unavailable' }));
  return feed;
}

async function canonicalMovie(
  id: string,
  title: string,
  year: string,
  signal: AbortSignal,
  db: Db,
) {
  type Row = { id: string; movie: Movie; updated_at: string };
  let rows = checked(
    await db
      .from('a_list_movies')
      .select('id,movie,updated_at')
      .or(`id.eq.${id},movie->>imdbId.eq.${id}`)
      .limit(3)
      .abortSignal(signal),
  ) as Row[];
  if (rows.length > 1) throw new UnresolvedRelease('duplicate_catalogue_identity');
  let native: Movie | undefined;
  if (!rows.length) {
    const html = await fetchSource('https://www.dvdsreleasedates.com/search/', {
      signal,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ searchStr: title }).toString(),
    });
    const candidates = parseSearchResults(html).filter(
      (movie) => titleKey(movie.title) === titleKey(title) && (!movie.year || movie.year === year),
    );
    if (candidates.length > 3) throw new UnresolvedRelease('ambiguous_native_identity');
    const verified = await Promise.all(
      candidates.map(async (movie) =>
        verifiedIdentityId(movie)
          ? movie
          : parseDetail(await fetchSource(movie.source, { signal }), movie),
      ),
    );
    const matches = verified.filter((movie) => verifiedIdentityId(movie) === id);
    if (
      matches.length > 1 ||
      (!matches.length && verified.some((movie) => !verifiedIdentityId(movie)))
    )
      throw new UnresolvedRelease('ambiguous_native_identity');
    native = matches[0];
    if (native) {
      const row = checked(
        await db
          .from('a_list_movies')
          .select('id,movie,updated_at')
          .eq('id', native.id)
          .abortSignal(signal)
          .maybeSingle(),
      );
      if (row) rows = [row as Row];
    }
  }
  const row = rows[0];
  let movie = row?.movie || native;
  if (movie && verifiedIdentityId(movie) !== id) {
    if (!movie.source.startsWith('https://www.dvdsreleasedates.com/movies/'))
      throw new UnresolvedRelease('unverified_catalogue_identity');
    movie = parseDetail(await fetchSource(movie.source, { signal }), movie);
    if (verifiedIdentityId(movie) !== id)
      throw new UnresolvedRelease('conflicting_catalogue_identity');
  }
  if (native && movie) movie = mergeMovies([movie, native])[0];
  return { movie, version: row?.updated_at || null };
}

export async function expandReleases(
  feed: FeedEntry[],
  {
    dryRun = false,
    publishUnknown = process.env.ALIST_WTS_AUTO_IMPORT === 'true',
    budgetMs = 10000,
    limit = 5,
    signal: parent,
    db = adminDb(),
    checkpoint = true,
    expectedImdbId,
    sourcePages,
  }: {
    dryRun?: boolean;
    publishUnknown?: boolean;
    budgetMs?: number;
    limit?: number;
    signal?: AbortSignal;
    db?: Db;
    checkpoint?: boolean;
    expectedImdbId?: string;
    sourcePages?: ReadonlyMap<string, string>;
  } = {},
) {
  const start = Date.now(),
    own = AbortSignal.timeout(Math.max(1, budgetMs)),
    signal = parent ? AbortSignal.any([parent, own]) : own;
  const entries = feed.map((entry) => ({
      ...entry,
      ...((publishUnknown || dryRun) && entry.outcome === 'imports_paused'
        ? { nextCheckAt: undefined }
        : {}),
    })),
    work = dueReleaseEntries(entries, Date.now(), limit),
    decisions: {
      source: string;
      outcome: string;
      imdbId?: string;
      method?: string;
      movieId?: string;
      partial?: boolean;
    }[] = [];
  let changed = false;
  for (let offset = 0; offset < work.length && !signal.aborted; offset += 2) {
    await Promise.all(
      work.slice(offset, offset + 2).map(async (entry) => {
        let profile: SourceProfile | undefined,
          row: MatchRow | undefined,
          profileCheckedAt: string | undefined;
        const now = new Date().toISOString();
        try {
          const html =
              sourcePages?.get(entry.report.release.source) ||
              (await fetchSource(entry.report.release.source, {
                cache: 'no-store',
                signal,
              })),
            explicit = structuredFilmIdentity(html, entry.report.title);
          if (explicit.ambiguous) throw new UnresolvedRelease('conflicting_source_identity');
          const nativeProfile = profileReference(html, entry.report.title, text);
          if (nativeProfile && nativeProfile.sourceFilmUrl !== entry.report.release.source)
            throw new UnresolvedRelease('conflicting_source_identity');
          const reference = reportReference(html, entry.report.title, text);
          let mapping: ReviewedReportIdentity | undefined,
            metadata: Movie | undefined,
            evidence: MetadataEvidence | undefined;
          if (reference) {
            entry.sourceId = reference.sourceFilmId;
            row = checked(
              await db
                .from('a_list_release_candidates')
                .select('*')
                .eq('source_id', reference.sourceFilmId)
                .abortSignal(signal)
                .maybeSingle(),
            ) as MatchRow | undefined;
            const fresh =
              !nativeProfile &&
              row?.status === 'approved' &&
              Date.now() - Date.parse(row.profile_checked_at || row.checked_at) < SIX_HOURS &&
              row.profile.sourceFilmUrl === reference.sourceFilmUrl &&
              row.profile.year === reference.year &&
              titleKey(row.profile.title) === titleKey(reference.title);
            if (fresh && row) {
              profile = row.profile;
              profileCheckedAt = row.profile_checked_at || row.checked_at;
            } else {
              const source = nativeProfile
                ? html
                : await fetchSource(reference.sourceFilmUrl, { signal });
              try {
                profile = parseSourceProfile(source, reference);
                profileCheckedAt = now;
              } catch (error) {
                if (error instanceof SourceProfileConflict)
                  throw new UnresolvedRelease('conflicting_source_profile');
                throw error;
              }
            }
            const fingerprint = profileFingerprint(profile),
              cached = row ? cachedIdentity(row) : undefined;
            if (cached && cached.profileFingerprint === fingerprint) mapping = cached;
            if (!mapping && !row) {
              const seed = reviewedReportIdentities.find(
                (identity) =>
                  identity.sourceFilmId === reference.sourceFilmId &&
                  identity.sourceFilmUrl === reference.sourceFilmUrl &&
                  identity.year === profile!.year &&
                  titleKey(identity.title) === titleKey(profile!.title),
              );
              if (seed) mapping = { ...seed, profileFingerprint: fingerprint };
            }
            if (mapping && explicit.imdbId && mapping.imdbId !== explicit.imdbId)
              throw new UnresolvedRelease('conflicting_source_identity');
            if (!mapping) {
              if (!publishUnknown && !dryRun) throw new UnresolvedRelease('imports_paused');
              if (explicit.imdbId)
                evidence = automaticEvidence(
                  profile,
                  [await getMetadataEvidence(explicit.imdbId, signal)],
                  explicit.imdbId,
                );
              else {
                const candidates = (await searchMetadata(profile.title, signal)).filter(
                  (movie) => titleKey(movie.title) === titleKey(profile!.title),
                );
                if (candidates.length > 3) throw new UnresolvedRelease('ambiguous_identity');
                // A failed candidate lookup cannot establish uniqueness among the remaining candidates.
                evidence = automaticEvidence(
                  profile,
                  await Promise.all(
                    candidates.map((movie) => getMetadataEvidence(movie.id, signal)),
                  ),
                );
              }
              mapping = inferredIdentity(
                profile,
                evidence,
                explicit.imdbId ? 'structured' : 'corroborated',
                now,
                fingerprint,
              );
              if (row?.approved_imdb_id && row.approved_imdb_id !== mapping.imdbId)
                throw new UnresolvedRelease('conflicting_previous_identity');
              metadata = evidence.movie;
            }
          } else {
            if (!explicit.imdbId) throw new UnresolvedRelease('unresolved_native_reference');
            if (!publishUnknown && !dryRun && !entry.movieId)
              throw new UnresolvedRelease('imports_paused');
            const current = checked(
              await db
                .from('a_list_movies')
                .select('movie')
                .eq('id', entry.movieId || explicit.imdbId)
                .abortSignal(signal)
                .maybeSingle(),
            );
            metadata = current?.movie as Movie | undefined;
            if (!metadata) metadata = (await getMetadataEvidence(explicit.imdbId, signal)).movie;
            if (
              (metadata.imdbId || metadata.id) !== explicit.imdbId ||
              titleKey(metadata.title) !== titleKey(entry.report.title) ||
              (explicit.year && metadata.year !== explicit.year)
            )
              throw new UnresolvedRelease('conflicting_source_identity');
          }
          const id = mapping?.imdbId || explicit.imdbId;
          if (expectedImdbId && id !== expectedImdbId)
            throw new UnresolvedRelease('different_film_identity');
          const profileEvidence = nativeProfile
            ? profileReleaseEvidence(html, nativeProfile)
            : undefined;
          const verifiedReports = (
            profileEvidence
              ? profileEvidence.reports.map((report) => ({ ...report, imdbId: id }))
              : [entry.report]
          )
            .map((report) => parseVerifiedReport(html, report, mapping ? [mapping] : []))
            .filter((report) => report !== null);
          if (!verifiedReports.length) {
            if (profileEvidence && !profileEvidence.withdrawnKinds.length)
              throw new Error('Release profile date format changed');
            if (!dryRun) {
              if (profileEvidence && id) {
                const current = await canonicalMovie(id, mapping!.title, mapping!.year, signal, db);
                if (current.movie)
                  checked(
                    await db
                      .rpc('a_list_withdraw_release_windows', {
                        p_movie_id: current.movie.id,
                        p_imdb_id: id,
                        p_source: entry.report.release.source,
                        p_kinds: profileEvidence.withdrawnKinds,
                        p_version: current.version,
                      })
                      .abortSignal(signal),
                  );
              } else
                checked(
                  await db
                    .rpc('a_list_withhold_release_report', {
                      p_source: entry.report.release.source,
                    })
                    .abortSignal(signal),
                );
              changed = true;
            }
            entry.outcome = 'withheld';
            entry.checkedAt = now;
            entry.nextCheckAt = new Date(Date.now() + SIX_HOURS).toISOString();
            decisions.push({ source: entry.report.release.source, outcome: 'withheld' });
            return;
          }
          if (!id || verifiedReports.some((report) => report.imdbId !== id))
            throw new UnresolvedRelease('conflicting_source_identity');
          const existing = await canonicalMovie(
            id,
            mapping?.title || metadata!.title,
            mapping?.year || metadata!.year,
            signal,
            db,
          );
          if (!metadata) metadata = existing.movie || (await getMetadataEvidence(id, signal)).movie;
          const movie = expansionMovie(
            metadata,
            verifiedReports.map((report) => report.release),
            existing.movie,
            profileEvidence?.withdrawnKinds.map((kind) => ({
              source: entry.report.release.source,
              kind,
            })),
          );
          const partial =
            !!profileEvidence &&
            !!existing.movie?.releases.some(
              (release) =>
                release.source === entry.report.release.source &&
                profileEvidence.unknownKinds.includes(release.kind),
            );
          if (partial)
            movie.releaseCheck = {
              status: 'partial',
              attemptedAt: now,
              issues: [{ provider: 'wts', category: 'format_changed' }],
            };
          if (!dryRun) {
            const p_match =
              profile && mapping
                ? {
                    source_id: profile.sourceFilmId,
                    profile,
                    fingerprint: profileFingerprint(profile),
                    profile_checked_at: profileCheckedAt,
                    reports: [entry.report],
                    suggestions: evidence ? [evidence] : row?.suggestions || [],
                    method: mapping.method || 'reviewed',
                    imdb_id: id,
                    status: 'approved',
                    rationale: mapping.evidence.corroboration,
                    rule_version: MATCH_RULE_VERSION,
                  }
                : null;
            checked(
              await db
                .rpc('a_list_store_release_match', {
                  p_match,
                  p_movie: movie,
                  p_version: existing.version,
                  p_reports: verifiedReports.map((report) => report.release),
                })
                .abortSignal(signal),
            );
            changed = true;
          }
          entry.movieId = movie.id;
          entry.checkedAt = now;
          entry.nextCheckAt = new Date(
            Date.now() + (partial ? TRANSIENT_RETRY_MS : SIX_HOURS),
          ).toISOString();
          entry.outcome = 'matched';
          decisions.push({
            source: entry.report.release.source,
            outcome: 'matched',
            ...(partial ? { partial: true } : {}),
            imdbId: id,
            method: verifiedReports[0].release.filmIdentityMethod,
            movieId: movie.id,
          });
        } catch (error) {
          const outcome =
            error instanceof UnresolvedRelease
              ? error.message
              : signal.aborted
                ? 'budget_exhausted'
                : 'source_unavailable';
          entry.outcome = outcome;
          if (!signal.aborted) {
            entry.checkedAt = now;
            entry.nextCheckAt = new Date(
              Date.now() +
                (outcome === 'imports_paused'
                  ? SIX_HOURS
                  : outcome === 'source_unavailable'
                    ? TRANSIENT_RETRY_MS
                    : 24 * 3600_000),
            ).toISOString();
          }
          // Only positively changed evidence invalidates an established mapping; network failures retain it.
          if (
            !dryRun &&
            row &&
            ((profile &&
              profileFingerprint(profile) !== row.fingerprint &&
              !['source_unavailable', 'budget_exhausted', 'imports_paused'].includes(outcome)) ||
              outcome.startsWith('conflicting_')) &&
            !signal.aborted
          ) {
            const invalidated = profile || row.profile;
            checked(
              await db
                .rpc('a_list_store_release_match', {
                  p_match: {
                    source_id: invalidated.sourceFilmId,
                    profile: invalidated,
                    fingerprint: profileFingerprint(invalidated),
                    reports: row.reports || [],
                    suggestions: [],
                    method: row.match_method || 'reviewed',
                    status: 'pending',
                    rationale: outcome,
                    rule_version: MATCH_RULE_VERSION,
                  },
                })
                .abortSignal(signal),
            );
            changed = true;
          } else if (!dryRun && outcome.startsWith('conflicting_') && !signal.aborted) {
            checked(
              await db
                .rpc('a_list_withhold_release_report', { p_source: entry.report.release.source })
                .abortSignal(signal),
            );
            changed = true;
          }
          decisions.push({ source: entry.report.release.source, outcome });
        }
      }),
    );
  }
  if (!dryRun) {
    // Writes get a small separate settling window after source work has been aborted.
    if (checkpoint)
      checked(
        await db
          .from('a_list_source_status')
          .update({ wts_feed: entries })
          .eq('id', true)
          .abortSignal(parent || AbortSignal.timeout(3000)),
      );
    if (changed) await invalidateReleaseCaches();
  }
  const result = {
    processed: decisions.length,
    matched: decisions.filter((d) => d.outcome === 'matched').length,
    unresolved: decisions.filter((d) => !['matched', 'withheld'].includes(d.outcome)).length,
    changed,
    dryRun,
    durationMs: Date.now() - start,
    decisions,
  };
  console.info(
    JSON.stringify({
      event: 'automatic_release_expansion',
      processed: result.processed,
      matched: result.matched,
      unresolved: result.unresolved,
      dryRun,
      durationMs: result.durationMs,
    }),
  );
  return result;
}
