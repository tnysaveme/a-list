import { availableRelease, displayRelease, type Movie } from './model';
import { releaseLabels } from './release-labels';

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export function searchMatches(
  catalogue: Movie[],
  results: Movie[],
  query: string,
  today: string,
): Movie[] {
  const term = query.trim().toLowerCase(),
    films = catalogue.filter((movie) => movie.mediaType !== 'series'),
    found = results.filter((movie) => movie.mediaType !== 'series');
  if (term.length < 2)
    return films.filter((m) => m.theatrical && m.theatrical >= today).slice(0, 5);
  const local = films.filter((m) => m.title.toLowerCase().includes(term));
  // Search responses contain canonical metadata. A catalogue snapshot must not replace it,
  // including when a newer response removes a date that a source has withdrawn.
  const fresh = new Map(found.map((m) => [m.id, m]));
  return [...found, ...local.filter((m) => !fresh.has(m.id))].slice(0, 24);
}

export function searchReleaseSummary(movie: Movie, today: string): string {
  const available = availableRelease(movie, today);
  const release = displayRelease(movie, today);
  if (!release) return releaseLabels.unknown;
  const date = dateFormat.format(new Date(`${release.date}T12:00:00Z`));
  const window =
    release.platform ||
    (release.kind === 'Subscription'
      ? 'Subscription'
      : release.kind === 'PVOD'
        ? 'Premium rental/purchase'
        : 'Digital rental/purchase');
  const status =
    release.confidence === 'rumored'
      ? releaseLabels.unconfirmed
      : available
        ? releaseLabels.available
        : releaseLabels.soon;
  return `${window} · ${status} · ${date}`;
}
