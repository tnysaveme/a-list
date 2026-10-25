import type { Movie } from './model';
import { text } from './sources';
import { filmIndex, imdbId } from './film-identity';
export { imdbId } from './film-identity';
const BASE = 'https://v3-cinemeta.strem.io';
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export function parseMetadata(value: unknown, checkedAt = new Date().toISOString()): Movie | null {
  if (
    !object(value) ||
    value.type !== 'movie' ||
    !imdbId(value.id) ||
    typeof value.name !== 'string' ||
    !value.name.trim()
  )
    return null;
  const id = value.id,
    title = text(value.name).slice(0, 300),
    year = String(value.releaseInfo || value.year || '').match(/^(?:18|19|20)\d{2}/)?.[0] || '';
  let poster = '';
  if (typeof value.poster === 'string')
    try {
      const url = new URL(value.poster);
      if (url.protocol === 'https:') poster = url.href;
    } catch {}
  const overview =
    typeof value.description === 'string' ? text(value.description).slice(0, 4000) : undefined;
  return {
    id,
    imdbId: id,
    title,
    year,
    poster,
    overview,
    overviewSource: overview ? `${BASE}/meta/movie/${id}.json` : undefined,
    source: `https://www.imdb.com/title/${id}/`,
    metadataCheckedAt: checkedAt,
    checkedAt,
    releases: [],
  };
  // A metadata premiere/released date is deliberately never a US home release date.
}
export function parseMetadataSearch(value: unknown): Movie[] {
  if (!object(value) || !Array.isArray(value.metas))
    throw new Error('Movie catalogue format changed');
  const movies = value.metas
    .slice(0, 30)
    .map((m) => parseMetadata(m))
    .filter((m): m is Movie => !!m);
  return [...new Map(movies.map((movie) => [movie.id, movie])).values()];
}
export function mergeSearchProviders(listings: Movie[], metadata: Movie[]): Movie[] {
  const used = new Set<string>();
  const index = filmIndex(metadata);
  const listingsIndex = filmIndex(listings);
  const movies = listings.map((movie) => {
    const decision = index.resolve(movie);
    const match = decision.status === 'matched' ? decision.candidates[0] : undefined;
    if (!match || listingsIndex.resolve(match).status !== 'matched') return movie;
    used.add(match.id);
    return {
      ...match,
      ...movie,
      imdbId: match.imdbId,
      overview: movie.overview || match.overview,
      overviewSource: movie.overview ? movie.overviewSource : match.overviewSource,
      metadataCheckedAt: match.metadataCheckedAt,
    };
  });
  return [...movies, ...metadata.filter((m) => !used.has(m.id))];
}
async function fetchMetadata(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(BASE + path, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
      : AbortSignal.timeout(8000),
    next: { revalidate: 21600 },
    headers: { 'User-Agent': 'A-List/1.0 (movie metadata)' },
  });
  if (!response.ok) throw new Error(`Movie catalogue returned ${response.status}`);
  const body = await response.text();
  if (body.length > 2_000_000) throw new Error('Movie catalogue response too large');
  return JSON.parse(body);
}
export async function searchMetadata(query: string, signal?: AbortSignal): Promise<Movie[]> {
  return parseMetadataSearch(
    await fetchMetadata(`/catalog/movie/top/search=${encodeURIComponent(query)}.json`, signal),
  );
}
export type MetadataEvidence = { movie: Movie; directors: string[]; cast: string[] };
export async function getMetadataEvidence(
  id: string,
  signal?: AbortSignal,
): Promise<MetadataEvidence> {
  if (!imdbId(id)) throw new Error('Invalid movie metadata ID');
  const data = await fetchMetadata(`/meta/movie/${id}.json`, signal),
    raw = object(data) ? data.meta : null;
  const movie = parseMetadata(raw);
  if (!movie && (!object(raw) || raw.id === id)) throw new Error('Movie metadata not listed');
  if (!movie || movie.id !== id) throw new Error('Movie metadata identity mismatch');
  const names = (value: unknown) =>
    Array.isArray(value)
      ? value
          .filter((v): v is string => typeof v === 'string')
          .slice(0, 30)
          .map((v) => text(v).slice(0, 200))
      : typeof value === 'string'
        ? [text(value).slice(0, 200)]
        : [];
  return {
    movie,
    directors: object(raw) ? names(raw.director) : [],
    cast: object(raw) ? names(raw.cast) : [],
  };
}
export async function getMetadata(id: string, signal?: AbortSignal): Promise<Movie> {
  if (!imdbId(id)) throw new Error('Invalid movie metadata ID');
  const data = await fetchMetadata(`/meta/movie/${id}.json`, signal);
  const movie = object(data) ? parseMetadata(data.meta) : null;
  if (!movie && (!object(data) || !object(data.meta) || data.meta.id === id))
    throw new Error('Movie metadata not listed');
  if (!movie || movie.id !== id) throw new Error('Movie metadata identity mismatch');
  return movie;
}
