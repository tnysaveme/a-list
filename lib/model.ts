export type Release = { kind: 'Digital' | 'PVOD' | 'Subscription'; date: string; confidence: 'listed' | 'rumored'; source: string; sourceName: string; platform?: string; checkedAt?: string; filmImdbId?: string; filmIdentityMethod?: 'structured' | 'reviewed' | 'corroborated'; filmIdentitySource?: string };
import {verifiedIdentityId} from './film-identity';
export type Movie = { id: string; title: string; year: string; poster: string; source: string; overview?: string; overviewSource?: string; imdbId?: string; identityVerifiedAt?: string; metadataCheckedAt?: string; synopsisCheckedAt?: string; releaseCheckedAt?: string; rating?: string; theatrical?: string; releases: Release[]; checkedAt: string; calendarUpdatedAt?: string; addedAt?: string; tracked?: boolean; saved?: boolean; discoveredFrom?: 'When To Stream' };
export const verifiedReleases = (movie: Movie) => movie.releases.filter(release => release.sourceName !== 'When To Stream' ||
  !!release.filmImdbId && release.filmImdbId === verifiedIdentityId(movie));
export const sanitizeMovie = (movie: Movie): Movie => ({...movie, releases: verifiedReleases(movie)});
export const validMovieId=(id:string)=>/^(?:[0-9]{1,8}|tt[0-9]{7,10})$/.test(id);
export const releaseCheckDue=(movie:Movie,now=Date.now())=>!movie.releaseCheckedAt||!Number.isFinite(Date.parse(movie.releaseCheckedAt))||now-Date.parse(movie.releaseCheckedAt)>=6*3600_000;
export const availableRelease=(movie:Movie,today=new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'}))=>verifiedReleases(movie).filter(r=>r.confidence==='listed'&&r.date<=today).sort((a,b)=>a.date.localeCompare(b.date)).at(-1);
export const nextRelease = (movie: Movie, today=new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'})) => {
 const sorted=verifiedReleases(movie).sort((a,b)=>a.date.localeCompare(b.date));
 return sorted.find(r=>r.date>=today)||sorted.at(-1);
};
export const displayRelease=(movie:Movie,today?:string)=>availableRelease(movie,today)||nextRelease(movie,today);
export function mergeMovies(movies: Movie[]): Movie[] {
  const map = new Map<string, Movie>();
  for (const movie of movies) { const prev = map.get(movie.id); map.set(movie.id, prev ? {...prev, ...movie, releases: [...new Map([...prev.releases,...movie.releases].map(r=>[r.kind,r])).values()]} : movie); }
  return [...map.values()].map(sanitizeMovie);
}
