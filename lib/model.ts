export type Release = { kind: 'Digital' | 'PVOD' | 'Subscription'; date: string; confidence: 'listed' | 'rumored'; source: string; sourceName: string; platform?: string; checkedAt?: string };
export type Movie = { id: string; title: string; year: string; poster: string; source: string; overview?: string; rating?: string; theatrical?: string; releases: Release[]; checkedAt: string; addedAt?: string; tracked?: boolean };
export const nextRelease = (movie: Movie, today=new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'})) => {
 const sorted=[...movie.releases].sort((a,b)=>a.date.localeCompare(b.date));
 return sorted.find(r=>r.date>=today)||sorted.at(-1);
};
export function mergeMovies(movies: Movie[]): Movie[] {
  const map = new Map<string, Movie>();
  for (const movie of movies) { const prev = map.get(movie.id); map.set(movie.id, prev ? {...prev, ...movie, releases: [...new Map([...prev.releases,...movie.releases].map(r=>[r.kind,r])).values()]} : movie); }
  return [...map.values()];
}
