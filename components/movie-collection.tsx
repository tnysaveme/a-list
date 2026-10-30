'use client';
import { memo } from 'react';
import { MembershipIcon } from './membership-icon';
import type { Movie } from '../lib/model';
import { releaseForView } from '../lib/catalogue-view';
import { releaseLabels } from '../lib/release-labels';
import { MovieCardPoster } from './movie-card-poster';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
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
      </div>
    </div>
  );
});

/** Details polling and notices must not repeat release/date work for the background grid. */
export const MovieCollection = memo(function MovieCollection({
  movies,
  layout,
  filter,
  currentDay,
  selecting,
  selection,
  savedIds,
  libraryById,
  pendingIds,
  busy,
  ready,
  onOpen,
  onSave,
  onToggle,
}: Props) {
  return (
    <div className={`movie-grid ${layout === 'list' ? 'movie-list' : ''}`}>
      {movies.map((m, index) => {
        const saved = savedIds.has(m.id);
        const membershipKnown = typeof m.saved === 'boolean' || libraryById.has(m.id);
        return (
          <article
            data-movie-id={m.id}
            className={`movie-card ${selection.has(m.id) ? 'is-selected' : ''}`}
            key={m.id}
          >
            <MovieCardPoster
              src={m.poster}
              title={m.title}
              sizes={
                layout === 'list'
                  ? '(min-width: 56rem) 72px, 56px'
                  : '(min-width: 1360px) 233.6px, (min-width: 70rem) calc((100vw - 192px) / 5), (min-width: 56rem) calc((100vw - 136px) / 4), (min-width: 40rem) calc((100vw - 112px) / 3), calc((100vw - 48px) / 2)'
              }
              eager={index < 5}
              priority={index === 0}
              selecting={selecting}
              selected={selection.has(m.id)}
              onOpen={() => (selecting ? onToggle(m.id) : onOpen(m))}
            >
              {selecting ? (
                <label className="poster-checkbox">
                  <input
                    type="checkbox"
                    checked={selection.has(m.id)}
                    onChange={() => onToggle(m.id)}
                    aria-label={`Select ${m.title}`}
                  />
                </label>
              ) : (
                <>
                  <button
                    disabled={busy || !ready}
                    aria-busy={pendingIds.has(m.id)}
                    className={`save-button ${saved ? 'is-saved' : ''}`}
                    aria-label={
                      pendingIds.has(m.id)
                        ? `${saved ? 'Removing' : 'Saving'} ${m.title}…`
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
                      pending={pendingIds.has(m.id)}
                      unknown={!membershipKnown}
                    />
                  </button>
                </>
              )}
            </MovieCardPoster>
            <MovieInfo movie={m} filter={filter} currentDay={currentDay} />
          </article>
        );
      })}
    </div>
  );
});
