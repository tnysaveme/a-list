export type OfflineMovie = {
  id: string;
  title: string;
  year: string;
  watchedAt: string | null;
  releases: { date: string; kind: string; platform: string; confidence: string }[];
};
export type OfflineSnapshot = { owner: string; syncedAt: string; movies: OfflineMovie[] };

/** Whitelist the read-only view: no auth data, email, feed URLs or source credentials. */
export function offlineMovies(rows: Record<string, unknown>[]): OfflineMovie[] {
  return rows.map((row) => ({
    id: String(row.movieId || row.id || ''),
    title: String(row.title || 'Untitled film'),
    year: String(row.year || ''),
    watchedAt: typeof row.watchedAt === 'string' ? row.watchedAt : null,
    releases: Array.isArray(row.releases)
      ? row.releases.map((release) => ({
          date: String(release.date || ''),
          kind: String(release.kind || ''),
          platform: String(release.platform || ''),
          confidence: String(release.confidence || ''),
        }))
      : [],
  }));
}
