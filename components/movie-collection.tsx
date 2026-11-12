'use client';
import { memo } from 'react';
import { MembershipIcon } from './membership-icon';
import { CalendarDays, CircleCheck } from 'lucide-react';
import type { Movie } from '../lib/model';
import { releaseForView } from '../lib/catalogue-view';
import { releaseLabels } from '../lib/release-labels';
import { MovieCardPoster } from './movie-card-poster';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const watchedDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });
const shortDate = (date: string) => dateFormatter.format(new Date(`${date}T12:00:00Z`));

type Props = {
  movies: Movie[];
  layout: string;
  filter: string;
  currentDay: string;
  selecting: boolean;
  selection: Set<string>;
  savedIds: Set<string>;
  libraryById: Map<string, Movie>;
  pendingIds: Set<string>;
  pendingAction?: 'add' | 'remove' | null;
  busy: boolean;
  ready: boolean;
  onOpen: (movie: Movie) => void;
  onSave: (movie: Movie) => Promise<void>;
  onToggle: (id: string) => void;
};

/** Selection changes do not repeat release formatting or recreate reading content. */
const MovieInfo = memo(function MovieInfo({
  movie,
  filter,
  currentDay,
}: {
  movie: Movie;
  filter: string;
  currentDay: string;
}) {
  const release = releaseForView(movie, filter, currentDay);
  return (
    <div className="movie-info">
      <h3>{movie.title}</h3>
      <div className="movie-meta">
        {movie.year && <span>{movie.year}</span>}
        {movie.watchedAt && (
          <span className="movie-watched">
            <CircleCheck size={12} aria-hidden="true" /> Watched
            {filter === 'watched' && (
              <>
                {' '}
                ·{' '}
                <time dateTime={movie.watchedAt}>
                  {watchedDate.format(new Date(movie.watchedAt))}
                </time>
              </>
            )}
          </span>
        )}
        {filter !== 'watched' && (
          <span className={`release-line ${release?.confidence || 'unknown'}`}>
            {release ? (
              <>
                <span className="release-confidence" aria-hidden="true" />
                <span className="release-timing">
                  {release.confidence === 'rumored' ? (
                    <span className="release-unconfirmed">{releaseLabels.unconfirmed} </span>
                  ) : (
                    <span className="sr-only">
                      {release.date <= currentDay
                        ? `${releaseLabels.available} · `
                        : `${releaseLabels.soon} · `}
                    </span>
                  )}
                  <time className="release-date" dateTime={release.date}>
                    {shortDate(release.date)}
                    {release.date.slice(0, 4) !== currentDay.slice(0, 4) &&
                      `, ${release.date.slice(0, 4)}`}
                  </time>
                </span>
                <span className="release-kind">{release.platform || release.kind}</span>
              </>
            ) : (
              <span className="unknown-date">{releaseLabels.unknown}</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
});

type CardProps = Pick<
  Props,
  | 'layout'
  | 'filter'
  | 'currentDay'
  | 'selecting'
  | 'busy'
  | 'ready'
  | 'onOpen'
  | 'onSave'
  | 'onToggle'
> & {
  movie: Movie;
  selected: boolean;
  saved: boolean;
  pending: boolean;
  saving: boolean;
  membershipKnown: boolean;
  eager: boolean;
  priority: boolean;
};

// Primitive per-card state lets a selection change update only the affected film.
const MovieCard = memo(function MovieCard({
  movie: m,
  layout,
  filter,
  currentDay,
  selecting,
  selected,
  saved,
  pending,
  saving,
  membershipKnown,
  eager,
  priority,
  busy,
  ready,
  onOpen,
  onSave,
  onToggle,
}: CardProps) {
  const release = releaseForView(m, filter, currentDay);
  return (
    <article data-movie-id={m.id} className={`movie-card ${selected ? 'is-selected' : ''}`}>
      <MovieCardPoster
        src={m.poster}
        title={m.title}
        sizes={
          layout === 'list'
            ? '(min-width: 56rem) 72px, 56px'
            : '(min-width: 1360px) 233.6px, (min-width: 70rem) calc((100vw - 192px) / 5), (min-width: 56rem) calc((100vw - 136px) / 4), (min-width: 40rem) calc((100vw - 112px) / 3), calc((100vw - 48px) / 2)'
        }
        eager={eager}
        priority={priority}
        selecting={selecting}
        selected={selected}
        onOpen={() => (selecting ? onToggle(m.id) : onOpen(m))}
        preview={
          <>
            <p className="film-preview-meta">
              {[m.year, m.rating, m.watchedAt ? 'Watched' : saved ? 'In Your Library' : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <h3>{m.title}</h3>
            <p className="film-preview-overview">
              {m.overview?.slice(0, 320) || 'A synopsis isn’t available from our sources yet.'}
            </p>
            <div className="film-preview-release">
              <CalendarDays size={18} aria-hidden="true" />
              <div>
                <strong>
                  {release
                    ? shortDate(release.date) +
                      (release.date.slice(0, 4) !== currentDay.slice(0, 4)
                        ? `, ${release.date.slice(0, 4)}`
                        : '')
                    : releaseLabels.unknown}
                </strong>
                <span>
                  {release
                    ? `${release.platform || release.kind}${release.confidence === 'rumored' ? ' · Unconfirmed' : release.date <= currentDay ? ' · Available' : ' · Coming Soon'}`
                    : 'Open the film for its latest release information.'}
                </span>
              </div>
            </div>
            <p className="film-preview-footer">Release dates can change.</p>
          </>
        }
      >
        <label className="poster-checkbox" hidden={!selecting}>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(m.id)}
            aria-label={`Select ${m.title}`}
          />
        </label>
        <button
          hidden={selecting}
          disabled={busy || !ready}
          aria-busy={pending}
          className={`save-button ${saved ? 'is-saved' : ''}`}
          aria-label={
            pending
              ? `${saving ? 'Saving' : 'Removing'} ${m.title}…`
              : !membershipKnown
                ? `Check saved state for ${m.title}`
                : saved
                  ? `${m.title} is saved`
                  : `Save ${m.title}`
          }
          aria-pressed={membershipKnown ? saved : undefined}
          onClick={() => (saved || !membershipKnown ? onOpen(m) : onSave(m))}
        >
          <MembershipIcon
            saved={saved}
            pending={pending}
            optimistic={saving}
            unknown={!membershipKnown && !saving}
          />
        </button>
      </MovieCardPoster>
      <MovieInfo movie={m} filter={filter} currentDay={currentDay} />
    </article>
  );
});

export const MovieCollection = memo(function MovieCollection({
  movies,
  selection,
  savedIds,
  libraryById,
  pendingIds,
  pendingAction,
  ...props
}: Props) {
  return (
    <div className={`movie-grid ${props.layout === 'list' ? 'movie-list' : ''}`}>
      {movies.map((movie, index) => (
        <MovieCard
          key={movie.id}
          {...props}
          movie={movie}
          selected={selection.has(movie.id)}
          saved={savedIds.has(movie.id)}
          pending={pendingIds.has(movie.id)}
          saving={pendingAction === 'add' && pendingIds.has(movie.id)}
          membershipKnown={typeof movie.saved === 'boolean' || libraryById.has(movie.id)}
          eager={index < 5}
          priority={index === 0}
        />
      ))}
    </div>
  );
});
