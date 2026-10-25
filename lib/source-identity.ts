import { titleKey } from './film-identity';
import type { Movie } from './model';
import { sourceAttribute } from './reviewed-report-identities';

export function assertListingSource(movie: Movie): void {
  const source = new URL(movie.source);
  const nativeId = source.pathname.match(/^\/movies\/(\d{1,8})\//)?.[1];
  if (
    source.protocol !== 'https:' ||
    source.hostname !== 'www.dvdsreleasedates.com' ||
    !nativeId ||
    (/^\d+$/.test(movie.id) && nativeId !== movie.id)
  )
    throw new Error('Film source identity mismatch');
}

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const imdbUrl = (value: unknown, allowHttp = false): string | undefined => {
  if (typeof value !== 'string') return;
  try {
    const url = new URL(value);
    if (
      !(url.protocol === 'https:' || (allowHttp && url.protocol === 'http:')) ||
      !['imdb.com', 'www.imdb.com'].includes(url.hostname)
    )
      return;
    return url.pathname.match(/^\/title\/(tt\d{7,10})(?:\/|$)/)?.[1];
  } catch {}
};

/** Only explicit Movie subjects in structured data establish a report's identity.
 * An article can mention several films; arbitrary IMDb links are not subject IDs.
 */
export function structuredFilmIdentity(
  html: string,
  title: string,
): { imdbId?: string; year?: string; ambiguous?: boolean } {
  const ids = new Set<string>(),
    years = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!object(value)) return;
    const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
    if (
      types.includes('Movie') &&
      typeof value.name === 'string' &&
      titleKey(value.name) === titleKey(title)
    ) {
      for (const field of ['sameAs', 'url', '@id']) {
        for (const link of Array.isArray(value[field]) ? value[field] : [value[field]]) {
          const id = imdbUrl(link);
          if (id) ids.add(id);
        }
      }
      if (
        typeof value.datePublished === 'string' &&
        /^(?:18|19|20)\d{2}(?:-|$)/.test(value.datePublished)
      )
        years.add(value.datePublished.slice(0, 4));
    }
    for (const child of Object.values(value)) if (typeof child === 'object') visit(child);
  };
  for (const script of html.matchAll(
    /<script\b[^>]*type=['"]application\/ld\+json['"][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      visit(JSON.parse(script[1]));
    } catch {}
  }
  return {
    imdbId: ids.size === 1 ? [...ids][0] : undefined,
    year: years.size === 1 ? [...years][0] : undefined,
    ambiguous: ids.size > 1,
  };
}

/** Use the native film's explicit sameAs property, excluding recommended-film links.
 * The source uses legacy HTTP IMDb URLs as identifiers; we never request those URLs.
 */
export function listingImdbId(html: string): string | undefined {
  const ids = new Set<string>();
  for (const link of html.matchAll(/<a\b[^>]*>/gi)) {
    if (!/\sitemprop\s*=\s*['"]sameAs['"]/i.test(link[0])) continue;
    const href = link[0].match(/\shref\s*=\s*['"]([^'"]+)['"]/i)?.[1];
    const id = imdbUrl(href, true);
    if (id) ids.add(id);
  }
  return ids.size === 1 ? [...ids][0] : undefined;
}

/** Legacy film pages omit the release heading. Their canonical ID and subject
 * must both match before they can be treated as an actual empty listing. */
export function listingSubjectMatches(
  html: string,
  movie: Movie,
  decode: (html: string) => string,
): boolean {
  try {
    assertListingSource(movie);
    const canonical = [...html.matchAll(/<link\b[^>]*>/gi)].find(
      (link) => sourceAttribute(link[0], 'rel') === 'canonical',
    );
    const source = new URL(canonical ? sourceAttribute(canonical[0], 'href') || '' : ''),
      expected = new URL(movie.source);
    const headings = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
    const subject =
      headings.length === 1
        ? decode(headings[0][1]).match(
            /^(.*?)\s+\(\s*(?:(?:18|19|20)\d{2}|TV (?:Mini )?Series(?:[^)]*)?)\s*\)$/i,
          )
        : null;
    return (
      source.protocol === 'https:' &&
      source.hostname === expected.hostname &&
      !source.port &&
      !source.search &&
      !source.hash &&
      !source.username &&
      !source.password &&
      /^\/movies\/\d{1,8}\/[^/]+\/?$/.test(source.pathname) &&
      source.pathname.split('/')[2] === expected.pathname.split('/')[2] &&
      !!subject &&
      titleKey(subject[1]) === titleKey(movie.title)
    );
  } catch {
    return false;
  }
}
