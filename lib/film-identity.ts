/** Provider IDs identify films; titles and years only shortlist candidates. */
export type FilmIdentity = {id?: string; imdbId?: string; title: string; year?: string; identityVerifiedAt?: string};
export const imdbId = (value: unknown): value is string => typeof value === 'string' && /^tt[0-9]{7,10}$/.test(value);

export function identityId(film: FilmIdentity): string | undefined {
  if (imdbId(film.id) && imdbId(film.imdbId) && film.id !== film.imdbId) return undefined;
  return imdbId(film.imdbId) ? film.imdbId : imdbId(film.id) ? film.id : undefined;
}

export const conflictingIdentity = (film: FilmIdentity) =>
  !!film.imdbId && !imdbId(film.imdbId) || imdbId(film.id) && imdbId(film.imdbId) && film.id !== film.imdbId;

/** Legacy title-based links are claims until checked against their native source. */
export const verifiedIdentityId = (film: FilmIdentity) => !conflictingIdentity(film) &&
  (imdbId(film.id) || !!film.identityVerifiedAt && Number.isFinite(Date.parse(film.identityVerifiedAt))) ? identityId(film) : undefined;

// Keep word boundaries, digits and non-Latin letters. "AB" and "A B" are distinct.
export const titleKey = (title: string) => title.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/['’]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const yearKey = (film: FilmIdentity) => film.year && /^(?:18|19|20)\d{2}$/.test(film.year)
  ? `${titleKey(film.title)}\0${film.year}` : undefined;

export type IdentityDecision<T> = {status: 'matched' | 'candidate' | 'ambiguous' | 'conflict' | 'unmatched'; candidates: T[]};

export function filmIndex<T extends FilmIdentity>(films: readonly T[]) {
  const byImdb = new Map<string, T[]>(), byTitle = new Map<string, T[]>(), byTitleYear = new Map<string, T[]>();
  const add = (map: Map<string, T[]>, key: string | undefined, film: T) => {
    if (!key) return;
    const bucket = map.get(key);
    if (bucket) bucket.push(film); else map.set(key, [film]);
  };
  for (const film of films) {
    if (conflictingIdentity(film)) continue;
    add(byImdb, verifiedIdentityId(film), film);
    add(byTitle, titleKey(film.title), film);
    add(byTitleYear, yearKey(film), film);
  }
  return {
    candidates(film: FilmIdentity): T[] {
      const key = yearKey(film);
      return (key ? byTitleYear.get(key) : byTitle.get(titleKey(film.title))) || [];
    },
    resolve(film: FilmIdentity): IdentityDecision<T> {
      if (conflictingIdentity(film)) return {status: 'conflict', candidates: []};
      const id = verifiedIdentityId(film), exact = id ? byImdb.get(id) || [] : [];
      if (exact.length) return {status: exact.length === 1 ? 'matched' : 'ambiguous', candidates: exact};
      const key = yearKey(film), candidates = key ? byTitleYear.get(key) || [] : [];
      if (id && candidates.some(candidate => identityId(candidate) && identityId(candidate) !== id)) {
        return {status: 'conflict', candidates};
      }
      return {status: candidates.length > 1 ? 'ambiguous' : candidates.length ? 'candidate' : 'unmatched', candidates};
    },
  };
}
