import type { Movie } from './model';
export type DetailMemory = Map<string, { movie: Movie; at: number; key: string }>;
const key = (movie: Movie) =>
  JSON.stringify([
    movie.calendarUpdatedAt || '',
    movie.releases.map((r) => [r.kind, r.date, r.confidence, r.source, r.platform]),
  ]);
export function rememberedDetail(memory: DetailMemory, movie: Movie, now = Date.now()) {
  const found = memory.get(movie.id);
  return found && now - found.at < 60000 && found.key === key(movie) ? found.movie : null;
}
export function rememberDetail(memory: DetailMemory, movie: Movie, now = Date.now()) {
  if (movie.refreshPending) return;
  memory.delete(movie.id);
  memory.set(movie.id, { movie, at: now, key: key(movie) });
  while (memory.size > 50) memory.delete(memory.keys().next().value!);
}
