'use client';
import { ArrowUpRight, Film } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import type { Movie } from '../lib/model';
import type { LibraryPage } from '../lib/pagination';
import { FilmPoster } from './film-poster';

const dateLabel = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });
const month = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });

export function LibraryWeek({
  entries = [],
  currentDay,
  onOpen,
  children,
}: {
  entries: LibraryPage['weekReleases'];
  currentDay: string;
  onOpen: (movie: Movie) => void;
  children?: ReactNode;
}) {
  const listId = useId();
  const [expandedForDay, setExpandedForDay] = useState<string | null>(null);
  const expanded = expandedForDay === currentDay;
  const until = new Date(`${currentDay}T12:00:00Z`);
  until.setUTCDate(until.getUTCDate() + 7);
  const week = entries.filter(
    ({ release }) => release.date >= currentDay && release.date < until.toISOString().slice(0, 10),
  );
  const visible = expanded ? week : week.slice(0, 3);
  return (
    <section className="week-summary" aria-labelledby="week-heading">
      <div className="week-heading">
        <div>
          <h2 id="week-heading">This Week</h2>
          <p>Next 7 days</p>
        </div>
      </div>
      {week.length ? (
        <>
          <ul id={listId} className="week-releases">
            {visible.map(({ movie, release }) => {
              const date = new Date(`${release.date}T12:00:00Z`);
              return (
                <li key={movie.id}>
                  <button className="week-release" onClick={() => onOpen(movie)}>
                    <time
                      className="week-date"
                      dateTime={release.date}
                      aria-label={`${release.date === currentDay ? 'Today, ' : `${weekday.format(date)}, `}${dateLabel.format(date)}`}
                    >
                      <span>{release.date === currentDay ? 'Today' : weekday.format(date)}</span>
                      <strong>{date.getUTCDate()}</strong>
                      <span>{month.format(date)}</span>
                    </time>
                    <span className="week-artwork" aria-hidden="true">
                      <Film size={20} />
                      {movie.poster && (
                        <FilmPoster src={movie.poster} alt="" width={48} height={72} sizes="48px" />
                      )}
                    </span>
                    <span className="week-film">
                      <strong>{movie.title}</strong>
                      <span>
                        {release.platform ||
                          (release.kind === 'Subscription'
                            ? 'Subscription'
                            : release.kind === 'PVOD'
                              ? 'Premium rent or buy'
                              : 'Rent or buy')}
                      </span>
                      {release.confidence === 'rumored' && (
                        <span className="release-unconfirmed">Unconfirmed</span>
                      )}
                    </span>
                    <ArrowUpRight className="week-open" size={16} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
          {week.length > 3 && (
            <button
              className="text-link week-expand"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => setExpandedForDay(expanded ? null : currentDay)}
            >
              {expanded ? 'Show fewer releases' : `Show all ${week.length} releases`}
            </button>
          )}
        </>
      ) : (
        <div className="week-quiet">
          <p className="week-empty">No saved releases in the next 7 days.</p>
          {children}
        </div>
      )}
    </section>
  );
}
