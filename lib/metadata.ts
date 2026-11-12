import type { Movie } from './model';
import { text, fetchSource, parseSynopsis, parseSearchResults, dateFromText } from './sources';
import { filmIndex, imdbId, verifiedIdentityId, titleKey } from './film-identity';
import { assertListingSource, listingImdbId, listingSubjectMatches } from './source-identity';
import { runtimeMinutes, type FilmFacts } from './release-evidence';
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
export type MetadataEvidence = {
  movie: Movie;
  directors: string[];
  cast: string[];
  primaryIdentityVerified?: boolean;
  facts?: FilmFacts;
};
export class UnsupportedMediaType extends Error {}
export class MetadataNotListed extends Error {
  constructor() {
    super('Movie metadata not listed');
  }
}
export class MetadataIdentityConflict extends Error {
  constructor() {
    super('Movie metadata identity mismatch');
  }
}
/** The existing main source can corroborate credits when metadata supplies only a short cast list. */
export function parseListingEvidence(html: string, movie: Movie): MetadataEvidence {
  if (
    movie.mediaType === 'series' ||
    /\(\s*TV (?:Mini )?Series\b/i.test(text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || ''))
  )
    throw new Error('TV series evidence is not supported');
  movie = { ...movie, source: text(movie.source) };
  assertListingSource(movie);
  const id = verifiedIdentityId(movie);
  if (!id || listingImdbId(html) !== id || !listingSubjectMatches(html, movie, text))
    throw new Error('Film source identity mismatch');
  const credits = (kind: string) =>
    [
      ...html.matchAll(
        new RegExp(`<[^>]+\\bitemprop=['"]${kind}['"][^>]*>([\\s\\S]*?)<\\/a>`, 'gi'),
      ),
    ]
      .map((match) => text(match[1].match(/itemprop=['"]name['"][^>]*>([\s\S]*?)<\//i)?.[1] || ''))
      .filter(Boolean)
      .slice(0, 100);
  return {
    primaryIdentityVerified: true,
    facts: {
      runtime: runtimeMinutes(
        text(html.match(/Runtime:\s*<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>/i)?.[1] || ''),
      ),
      theatrical:
        dateFromText(
          text(
            html.match(
              /Theater date[\s\S]{0,80}?<span\b[^>]*class=['"]mediumtext['"][^>]*>([\s\S]*?)<\/span>/i,
            )?.[1] || '',
          ),
        ) || undefined,
    },
    movie: {
      ...movie,
      id,
      imdbId: id,
      overview: parseSynopsis(html),
      overviewSource: movie.source,
    },
    directors: credits('director'),
    cast: credits('actor'),
  };
}
export async function getListingEvidence(movie: Movie, signal: AbortSignal) {
  return parseListingEvidence(
    await fetchSource(movie.source, { signal, cache: 'no-store' }),
    movie,
  );
}
export async function findListingEvidence(movie: Movie, signal: AbortSignal) {
  if (movie.source.startsWith('https://www.dvdsreleasedates.com/movies/'))
    return getListingEvidence(movie, signal);
  const id = verifiedIdentityId(movie);
  if (!id || movie.source !== `https://www.imdb.com/title/${id}/`) return;
  const html = await fetchSource('https://www.dvdsreleasedates.com/search/', {
    signal,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ searchStr: movie.title }).toString(),
  });
  const candidates = parseSearchResults(html)
    .filter((candidate) => titleKey(candidate.title) === titleKey(movie.title))
    .sort(
      (a, b) =>
        Math.abs(Number(a.year) - Number(movie.year)) -
        Math.abs(Number(b.year) - Number(movie.year)),
    )
    .slice(0, 2);
  for (const candidate of candidates) {
    const subject = { ...candidate, imdbId: id, identityVerifiedAt: new Date().toISOString() };
    if (listingSubjectMatches(html, candidate, text) && listingImdbId(html) === id)
      return parseListingEvidence(html, subject);
    const detail = await fetchSource(candidate.source, { signal, cache: 'no-store' });
    if (listingImdbId(detail) === id) return parseListingEvidence(detail, subject);
  }
}
export async function getMetadataEvidence(
  id: string,
  signal?: AbortSignal,
): Promise<MetadataEvidence> {
  if (!imdbId(id)) throw new Error('Invalid movie metadata ID');
  const data = await fetchMetadata(`/meta/movie/${id}.json`, signal),
    raw = object(data) ? data.meta : null;
  if (object(raw) && typeof raw.type === 'string' && raw.type !== 'movie')
    throw new UnsupportedMediaType('TV series and other media are not supported');
  const movie = parseMetadata(raw);
  if (!movie && (!object(raw) || raw.id === id)) throw new MetadataNotListed();
  if (!movie || movie.id !== id) throw new MetadataIdentityConflict();
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
    facts: object(raw)
      ? {
          runtime: runtimeMinutes(typeof raw.runtime === 'string' ? raw.runtime : ''),
          theatrical:
            typeof raw.released === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(raw.released)
              ? raw.released.slice(0, 10)
              : undefined,
        }
      : undefined,
    directors: object(raw)
      ? [
          ...new Set([
            ...names(raw.director),
            ...(Array.isArray(raw.credits_crew)
              ? raw.credits_crew
                  .filter((v) => object(v) && v.job === 'Director')
                  .flatMap((v) => (object(v) ? names(v.name) : []))
              : []),
          ]),
        ].slice(0, 30)
      : [],
    cast: object(raw)
      ? [
          ...new Set([
            ...names(raw.cast),
            ...(Array.isArray(raw.credits_cast)
              ? raw.credits_cast.slice(0, 100).flatMap((v) => (object(v) ? names(v.name) : []))
              : []),
          ]),
        ].slice(0, 100)
      : [],
  };
}
export async function getMetadata(id: string, signal?: AbortSignal): Promise<Movie> {
  if (!imdbId(id)) throw new Error('Invalid movie metadata ID');
  const data = await fetchMetadata(`/meta/movie/${id}.json`, signal);
  const movie = object(data) ? parseMetadata(data.meta) : null;
  if (!movie && (!object(data) || !object(data.meta) || data.meta.id === id))
    throw new MetadataNotListed();
  if (!movie || movie.id !== id) throw new MetadataIdentityConflict();
  return movie;
}
