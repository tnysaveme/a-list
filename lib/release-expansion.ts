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
  unchangedProfile,
  profileFingerprint,
  SourceProfileConflict,
  type SourceProfile,
} from './release-profile';
import {
  getMetadataEvidence,
  findListingEvidence,
  searchMetadata,
  type MetadataEvidence,
  UnsupportedMediaType,
} from './metadata';
import { titleKey, verifiedIdentityId } from './film-identity';
import {
  automaticEvidence,
  cachedIdentity,
  inferredIdentity,
  expansionMovie,
  mergeReleaseFeed,
  dueReleaseEntries,
  SIX_HOURS,
  WTS_DISCOVERY_CACHE_MS,
  MATCH_RULE_VERSION,
  UnresolvedRelease,
  type FeedEntry,
  type MatchRow,
} from './release-automation';
import { invalidateReleaseCaches } from './release-store';
import { mergeMovies, type Movie } from './model';
import { recordSourceCheck } from './source-checks';
import { TRANSIENT_RETRY_MS } from './source-health';
import { releaseSearchTitle } from './release-evidence';
import { reconcileReleaseDates, type ReleaseAudit } from './release-reconciliation';
import {
  releaseDiagnostic,
  type ReleaseDiagnostic,
  type ReleaseStage,
} from './release-diagnostics';
import { knownProfileMovies, corroborateCandidates } from './release-matching';
import { fetchVerifiedReport } from './source-verification';

type Db = ReturnType<typeof adminDb>;
export type ReleaseFeedState = { wts_feed?: FeedEntry[]; wts_feed_after?: string | null };
export async function expansionFeed(
  state: ReleaseFeedState,
  signal: AbortSignal,
  db = adminDb(),
): Promise<FeedEntry[]> {
  const previous = state.wts_feed || [];
  const cachedUntil = Date.parse(state.wts_feed_after || '');
  // Ignore the old six-hour discovery cache during rollout; keep short failure retries.
  if (cachedUntil > Date.now() && cachedUntil <= Date.now() + 15 * 60_000) return previous;
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
  const delay = results.every((result) => result.status === 'fulfilled')
    ? WTS_DISCOVERY_CACHE_MS
    : 15 * 60_000;
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
  if (rows.length > 1 && rows.some((row) => verifiedIdentityId(row.movie) !== id))
    throw new UnresolvedRelease('unverified_catalogue_identity');
  // Legacy metadata and primary listings can share a verified ID. Publish to the native
  // record; the database mirrors the verified windows to aliases without changing UIDs.
  rows.sort((a, b) => Number(a.id === id) - Number(b.id === id) || a.id.localeCompare(b.id));
  let native: Movie | undefined;
  if (!rows.length) {
    const html = await fetchSource('https://www.dvdsreleasedates.com/search/', {
      signal,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ searchStr: title }).toString(),
    });
    const candidates = parseSearchResults(html).filter(
      (movie) => titleKey(movie.title) === titleKey(title),
    );
    candidates.sort(
      (a, b) => Math.abs(Number(a.year) - Number(year)) - Math.abs(Number(b.year) - Number(year)),
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
    expectedMovie,
    sourcePages,
    knownMovies = [],
  }: {
    dryRun?: boolean;
    publishUnknown?: boolean;
    budgetMs?: number;
    limit?: number;
    signal?: AbortSignal;
    db?: Db;
    checkpoint?: boolean;
    expectedImdbId?: string;
    expectedMovie?: Movie;
    sourcePages?: ReadonlyMap<string, string>;
    knownMovies?: Movie[];
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
      diagnostic?: ReleaseDiagnostic;
      audit?: ReleaseAudit;
    }[] = [];
  const fetched = new Map<string, Promise<string>>();
  const sourcePage = (url: string) => {
    const supplied = sourcePages?.get(url);
    if (supplied !== undefined) return Promise.resolve(supplied);
    let pending = fetched.get(url);
    if (!pending) {
      pending = fetchSource(url, { cache: 'no-store', signal });
      fetched.set(url, pending);
    }
    return pending;
  };
  let changed = false;
  for (let offset = 0; offset < work.length && !signal.aborted; offset += 2) {
    await Promise.all(
      work.slice(offset, offset + 2).map(async (entry) => {
        let profile: SourceProfile | undefined,
          row: MatchRow | undefined,
          profileCheckedAt: string | undefined;
        const now = new Date().toISOString(),
          entryStarted = Date.now();
        let stage: ReleaseStage = 'profile';
        let articleWithdrawn = 0;
        const auditFor = (...args: Parameters<typeof reconcileReleaseDates>) => {
          const audit = reconcileReleaseDates(...args);
          audit.withdrawn += articleWithdrawn;
          return audit;
        };
        try {
          const html = await sourcePage(entry.report.release.source),
            explicit = structuredFilmIdentity(html, entry.report.title);
          if (explicit.ambiguous) throw new UnresolvedRelease('conflicting_source_identity');
          const nativeProfile = profileReference(html, entry.report.title, text);
          if (nativeProfile && nativeProfile.sourceFilmUrl !== entry.report.release.source)
            throw new UnresolvedRelease('conflicting_source_identity');
          const reference = reportReference(html, entry.report.title, text);
          if (
            entry.report.inventory &&
            (!nativeProfile || nativeProfile.sourceFilmId !== entry.sourceId)
          )
            throw new UnresolvedRelease('conflicting_source_identity');
          let profileHtml = nativeProfile ? html : undefined;
          let mapping: ReviewedReportIdentity | undefined,
            metadata: Movie | undefined,
            evidence: MetadataEvidence | undefined;
          if (reference) {
            entry.sourceId = reference.sourceFilmId;
            stage = 'database';
            row = checked(
              await db
                .from('a_list_release_candidates')
                .select('*')
                .eq('source_id', reference.sourceFilmId)
                .abortSignal(signal)
                .maybeSingle(),
            ) as MatchRow | undefined;
            stage = 'profile';
            const source = nativeProfile ? html : await sourcePage(reference.sourceFilmUrl);
            profileHtml = source;
            try {
              profile = parseSourceProfile(source, reference);
              if (profile.facts?.series) throw new UnresolvedRelease('not_movie');
              profileCheckedAt = now;
            } catch (error) {
              if (error instanceof SourceProfileConflict)
                throw new UnresolvedRelease('conflicting_source_profile');
              throw error;
            }
            const fingerprint = profileFingerprint(profile),
              cached = row ? cachedIdentity(row) : undefined;
            if (cached && unchangedProfile(profile, cached))
              mapping = {
                ...cached,
                title: profile.title,
                year: profile.year,
                profileFingerprint: fingerprint,
              };
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
              stage = 'identity';
              if (!publishUnknown && !dryRun) throw new UnresolvedRelease('imports_paused');
              if (explicit.imdbId)
                evidence = automaticEvidence(
                  profile,
                  [await getMetadataEvidence(explicit.imdbId, signal)],
                  explicit.imdbId,
                );
              else if (expectedImdbId) {
                // This film's ID is already independently verified by its native source.
                // Corroborate that exact subject; broad title searches add namesakes, not proof.
                try {
                  evidence = automaticEvidence(profile, [
                    await getMetadataEvidence(expectedImdbId, signal),
                  ]);
                } catch (error) {
                  if (error instanceof UnsupportedMediaType)
                    throw new UnresolvedRelease('not_movie');
                  if (
                    signal.aborted ||
                    !expectedMovie ||
                    verifiedIdentityId(expectedMovie) !== expectedImdbId
                  )
                    throw error;
                  const primary = await findListingEvidence(expectedMovie, signal);
                  if (!primary) throw error;
                  evidence = automaticEvidence(profile, [primary]);
                }
              } else {
                const local = knownProfileMovies(profile, knownMovies);
                if (local.length) {
                  try {
                    evidence = await corroborateCandidates(profile, local, signal);
                  } catch (error) {
                    if (
                      !(error instanceof UnresolvedRelease) ||
                      error.message !== 'insufficient_evidence'
                    )
                      throw error;
                  }
                }
                if (!evidence) {
                  const candidates = knownProfileMovies(
                    profile,
                    await searchMetadata(
                      releaseSearchTitle(
                        profile.title,
                        profile.facts?.nonfiction,
                        profile.directors,
                      ),
                      signal,
                    ),
                  );
                  evidence = await corroborateCandidates(profile, candidates, signal);
                }
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
          stage = 'profile';
          const id = mapping?.imdbId || explicit.imdbId;
          if (expectedImdbId && id !== expectedImdbId)
            throw new UnresolvedRelease('different_film_identity');
          if (mapping && !profileHtml) profileHtml = await sourcePage(mapping.sourceFilmUrl);
          const releaseProfile = profileHtml
            ? profileReference(profileHtml, entry.report.title, text)
            : undefined;
          const profileEvidence =
            releaseProfile &&
            (nativeProfile || /(?:VOD|PVOD|SVOD) Release Date\s*:/i.test(text(profileHtml!)))
              ? profileReleaseEvidence(profileHtml!, releaseProfile)
              : undefined;
          const verifiedReports = (profileEvidence?.reports || [])
            .map((report) =>
              parseVerifiedReport(
                profileHtml!,
                { ...report, imdbId: id },
                mapping ? [mapping] : [],
              ),
            )
            .filter((report) => report !== null);
          // Approved announcements can fill fields the native page still leaves TBA.
          // Check their current source; an old report snapshot never restores a date.
          if (nativeProfile && mapping && row?.reports.length) {
            const pages = new Map([[mapping.sourceFilmUrl, Promise.resolve(profileHtml!)]]);
            const retired = new Set<string>();
            const articles = [
              ...new Map(
                row.reports
                  .filter(
                    (report) =>
                      report.imdbId === id &&
                      report.release.filmImdbId === id &&
                      report.release.source !== mapping.sourceFilmUrl &&
                      report.release.sourceName === 'When To Stream',
                  )
                  .map((report) => [`${report.release.source}:${report.release.kind}`, report]),
              ).values(),
            ].slice(0, 3);
            for (const report of articles) {
              if (
                retired.has(report.release.source) ||
                verifiedReports.some((r) => r.release.kind === report.release.kind)
              )
                continue;
              const current = await fetchVerifiedReport(report, [mapping], signal, pages, true);
              if (current) verifiedReports.push(current);
              else {
                const before = await canonicalMovie(id!, mapping.title, mapping.year, signal, db);
                articleWithdrawn +=
                  before.movie?.releases.filter((r) => r.source === report.release.source).length ||
                  0;
                if (!dryRun)
                  checked(
                    await db
                      .rpc('a_list_withhold_release_report', { p_source: report.release.source })
                      .abortSignal(signal),
                  );
                retired.add(report.release.source);
                changed ||= !dryRun;
              }
            }
          }
          // Both discovery and title lookups prefer current profile fields. An article can
          // fill a window the profile still leaves TBA; its own subject is verified too.
          if (
            !nativeProfile &&
            !verifiedReports.some((r) => r.release.kind === entry.report.release.kind)
          ) {
            const article = parseVerifiedReport(html, entry.report, mapping ? [mapping] : []);
            if (article) verifiedReports.push(article);
          }
          if (!verifiedReports.length) {
            if (
              profileEvidence &&
              !profileEvidence.withdrawnKinds.length &&
              !profileEvidence.malformedKinds.length
            )
              throw new Error('Release profile date format changed');
            const existingRows =
              profileEvidence && id
                ? (checked(
                    await db
                      .from('a_list_movies')
                      .select('movie,updated_at')
                      .or(`id.eq.${id},movie->>imdbId.eq.${id}`)
                      .limit(3)
                      .abortSignal(signal),
                  ) as { movie: Movie; updated_at: string }[])
                : [];
            const existingRow = existingRows.find((row) => verifiedIdentityId(row.movie) === id);
            const current = existingRow
              ? { movie: existingRow.movie, version: existingRow.updated_at }
              : undefined;
            stage = 'publication';
            if (!dryRun) {
              if (profileEvidence && id) {
                if (current?.movie && profileEvidence.withdrawnKinds.length)
                  checked(
                    await db
                      .rpc('a_list_withdraw_release_windows', {
                        p_movie_id: current.movie.id,
                        p_imdb_id: id,
                        p_source: releaseProfile!.sourceFilmUrl,
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
            if (!dryRun && profile && mapping && id) {
              checked(
                await db
                  .rpc('a_list_store_release_identity', {
                    p_match: {
                      source_id: profile.sourceFilmId,
                      profile,
                      fingerprint: profileFingerprint(profile),
                      imdb_id: id,
                      method: mapping.method || 'reviewed',
                      rule_version: MATCH_RULE_VERSION,
                      rationale: mapping.evidence.corroboration,
                    },
                    p_movie_id: current?.movie?.id || null,
                  })
                  .abortSignal(signal),
              );
              changed = true;
            }
            const partial =
              !!profileEvidence?.malformedKinds.length ||
              !!current?.movie?.releases.some(
                (release) =>
                  release.source === releaseProfile?.sourceFilmUrl &&
                  profileEvidence?.absentKinds.includes(release.kind),
              );
            const outcome =
              articleWithdrawn ||
              current?.movie?.releases.some(
                (release) =>
                  release.source === releaseProfile?.sourceFilmUrl &&
                  profileEvidence?.withdrawnKinds.includes(release.kind),
              )
                ? 'withheld'
                : 'verified_no_date';
            entry.outcome = outcome;
            entry.checkedAt = now;
            entry.nextCheckAt = new Date(
              Date.now() + (partial ? TRANSIENT_RETRY_MS : SIX_HOURS),
            ).toISOString();
            decisions.push({
              source: entry.report.release.source,
              outcome,
              movieId: current?.movie?.id,
              ...(partial
                ? {
                    partial: true,
                    diagnostic: releaseDiagnostic(
                      new Error('Release profile format changed'),
                      'profile',
                      Date.now() - entryStarted,
                    ),
                  }
                : {}),
              audit: profileEvidence
                ? auditFor(
                    current?.movie,
                    [],
                    releaseProfile!.sourceFilmUrl,
                    profileEvidence.withdrawnKinds,
                    profileEvidence.unknownKinds,
                  )
                : undefined,
            });
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
              source: releaseProfile!.sourceFilmUrl,
              kind,
            })),
          );
          const partial =
            !!profileEvidence &&
            (!!profileEvidence.malformedKinds.length ||
              !!existing.movie?.releases.some(
                (release) =>
                  release.source === releaseProfile?.sourceFilmUrl &&
                  profileEvidence.unknownKinds.includes(release.kind),
              ));
          if (partial)
            movie.releaseCheck = {
              status: 'partial',
              attemptedAt: now,
              issues: [{ provider: 'wts', category: 'format_changed' }],
            };
          stage = 'publication';
          if (!dryRun) {
            const p_match =
              profile && mapping
                ? {
                    source_id: profile.sourceFilmId,
                    profile,
                    fingerprint: profileFingerprint(profile),
                    profile_checked_at: profileCheckedAt,
                    reports: verifiedReports,
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
            audit: auditFor(
              existing.movie,
              verifiedReports.map((report) => report.release),
              releaseProfile?.sourceFilmUrl || entry.report.release.source,
              profileEvidence?.withdrawnKinds,
              profileEvidence?.unknownKinds,
            ),
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
              outcome.startsWith('conflicting_') ||
              outcome === 'not_movie') &&
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
          } else if (
            !dryRun &&
            (outcome.startsWith('conflicting_') || outcome === 'not_movie') &&
            !signal.aborted
          ) {
            checked(
              await db
                .rpc('a_list_withhold_release_report', { p_source: entry.report.release.source })
                .abortSignal(signal),
            );
            changed = true;
          }
          const diagnostic = releaseDiagnostic(
            error,
            stage,
            Date.now() - entryStarted,
            signal.aborted,
          );
          decisions.push({ source: entry.report.release.source, outcome, diagnostic });
          console.warn(
            JSON.stringify({
              event: 'wts_verification_deferred',
              sourceId: entry.sourceId,
              outcome,
              ...diagnostic,
            }),
          );
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
          .update({ wts_feed: entries.filter((entry) => !entry.report.inventory) })
          .eq('id', true)
          .abortSignal(parent || AbortSignal.timeout(3000)),
      );
    if (changed) await invalidateReleaseCaches();
  }
  const result = {
    processed: decisions.length,
    matched: decisions.filter((d) => d.outcome === 'matched').length,
    unresolved: decisions.filter(
      (d) => !['matched', 'withheld', 'verified_no_date'].includes(d.outcome),
    ).length,
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
