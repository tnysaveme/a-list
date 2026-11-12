'use client';
import { releaseDay } from '../lib/release-day';
import { useStateEntrance } from '../hooks/use-state-entrance';
import { MembershipIcon } from './membership-icon';
import { useId, useState } from 'react';
import {
  CalendarDays,
  Film,
  CircleCheck,
  RotateCcw,
  ChevronDown,
  ExternalLink,
  LoaderCircle,
  Trash2,
  X,
} from 'lucide-react';
import { availableRelease, displayRelease, type Movie } from '../lib/model';
import { releaseLabels } from '../lib/release-labels';
import { FilmPoster } from './film-poster';
import './movie-details.css';
import { releaseStatusNotice } from '../lib/release-status';

const fullDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

export type MovieDetailsProps = {
  currentDay?: string;
  movie: Movie;
  saved: boolean;
  ready: boolean;
  busy: boolean;
  pending?: boolean;
  saving?: boolean;
  loading: boolean;
  error: string;
  onSave: () => void;
  onRemove: () => void;
  onClose: () => void;
  onWatched?: () => void;
  watching?: boolean;
};

export function MovieDetails({
  currentDay = releaseDay(),
  movie,
  saved,
  ready,
  busy,
  pending = busy,
  saving = false,
  loading,
  error,
  onSave,
  onRemove,
  onClose,
  onWatched,
  watching = false,
}: MovieDetailsProps) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const synopsis = useStateEntrance<HTMLParagraphElement>(expanded, 0);
  const series = movie.mediaType === 'series';
  const release = displayRelease(movie, currentDay);
  const available = !!availableRelease(movie, currentDay);
  const collapsible = !!movie.overview && movie.overview.length > 180;
  const checkedAt = movie.releaseCheckedAt || (!movie.id.startsWith('tt') && movie.checkedAt);
  const checkedDate =
    checkedAt && Number.isFinite(Date.parse(checkedAt)) ? checkedAt.slice(0, 10) : null;
  const warning = !loading ? releaseStatusNotice(movie) : undefined;
  const sourceProvider = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return 'Original source';
    }
  };
  const sources = [
    {
      href: movie.source,
      label: 'Release dates',
      provider:
        movie.releases.find((entry) => entry.source === movie.source)?.sourceName ||
        sourceProvider(movie.source),
    },
    ...movie.releases.map((entry) => ({
      href: entry.source,
      label: entry.kind === 'PVOD' ? 'Premium release' : `${entry.kind} release`,
      provider: entry.sourceName || sourceProvider(entry.source),
    })),
    ...(movie.overview && movie.overviewSource
      ? [
          {
            href: movie.overviewSource,
            label: 'Synopsis',
            provider: sourceProvider(movie.overviewSource),
          },
        ]
      : []),
  ].filter(
    (source, index, all) =>
      source.href && all.findIndex((entry) => entry.href === source.href) === index,
  );

  return (
    <article className="film-details">
      <button className="film-close film-control" aria-label="Close film details" onClick={onClose}>
        <X size={20} aria-hidden="true" />
      </button>
      <header className={`film-header ${movie.title.length > 44 ? 'film-header-long' : ''}`}>
        <div className="film-poster-frame">
          <span className="film-poster-fallback" aria-hidden="true">
            <Film size={24} />
            <span>Artwork unavailable</span>
          </span>
          <FilmPoster
            className="film-poster"
            src={movie.poster}
            alt={`${movie.title} poster`}
            width={360}
            height={540}
            sizes="(min-width: 900px) 216px, (min-width: 640px) 176px, 104px"
          />
        </div>
        <div className="film-heading">
          <h2 className="film-title" tabIndex={-1} data-autofocus>
            {movie.title}
          </h2>
          <p className="film-metadata">{[movie.year, movie.rating].filter(Boolean).join(' · ')}</p>
          <span
            className={`film-availability ${!release ? 'unknown' : release.confidence === 'rumored' ? 'unconfirmed' : 'listed'}`}
          >
            <span aria-hidden="true" />
            {!release
              ? releaseLabels.unknown
              : release.confidence === 'rumored'
                ? releaseLabels.unconfirmed
                : available
                  ? releaseLabels.available
                  : releaseLabels.soon}
          </span>
          {movie.theatrical && (
            <p className="film-theatrical">
              In US theatres <time dateTime={movie.theatrical}>{fullDate(movie.theatrical)}</time>
            </p>
          )}
        </div>
      </header>
      <section className="film-library" aria-label="Your library">
        <div className="film-library-actions">
          {saved ? (
            <button
              className="film-control film-saved"
              disabled={busy}
              aria-busy={pending}
              data-state={pending ? 'loading' : 'success'}
              onClick={onRemove}
            >
              <MembershipIcon saved pending={pending} optimistic={saving} size={16} />
              <span>{saving ? 'Saving…' : pending ? 'Removing…' : 'Saved to Library'}</span>
              {!pending && <Trash2 className="film-remove-icon" size={14} aria-hidden="true" />}
              {!pending && <span className="sr-only"> — remove from library</span>}
            </button>
          ) : (
            <button
              className="film-control film-save"
              disabled={!ready || busy || series}
              aria-describedby={series ? `${id}-movie-only` : undefined}
              aria-busy={pending}
              data-state={pending ? 'loading' : undefined}
              onClick={onSave}
            >
              <MembershipIcon saved={false} pending={pending} size={16} />
              {series ? 'Movies only' : pending ? 'Saving…' : 'Save to Library'}
            </button>
          )}
          {saved && onWatched && (
            <button
              className="film-control film-watch-toggle"
              disabled={busy}
              aria-busy={watching}
              onClick={onWatched}
            >
              {watching ? (
                <LoaderCircle size={16} className="spin" aria-hidden="true" />
              ) : movie.watchedAt ? (
                <RotateCcw size={16} aria-hidden="true" />
              ) : (
                <CircleCheck size={16} aria-hidden="true" />
              )}
              {watching ? 'Updating…' : movie.watchedAt ? 'Mark as Unwatched' : 'Mark as Watched'}
            </button>
          )}
        </div>
        <p className="film-library-note" id={series ? `${id}-movie-only` : undefined}>
          {series
            ? 'A-List tracks movies only. TV series are not supported.'
            : saving
              ? 'Your calendar feed will update when the save completes.'
              : saved
                ? movie.watchedAt
                  ? `Watched ${new Date(movie.watchedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. Kept out of your calendar feed.`
                  : 'To Watch · Included in your calendar feed.'
                : 'Save this film to follow its home-release dates in your calendar.'}
        </p>
        {error && (
          <p className="film-warning film-action-warning" role="status">
            {error}
          </p>
        )}
      </section>
      <section className="film-synopsis" aria-labelledby={`${id}-synopsis`}>
        <h3 className="film-section-title" id={`${id}-synopsis`}>
          Synopsis
        </h3>
        <p
          ref={synopsis}
          id={`${id}-copy`}
          className={`film-overview ${collapsible && !expanded ? 'film-overview-collapsed' : ''}`}
          aria-live="polite"
        >
          {movie.overview ||
            (loading
              ? 'Loading the synopsis…'
              : 'A synopsis isn’t available from our sources yet.')}
        </p>
        {collapsible && (
          <div className="film-synopsis-actions">
            <button
              className="film-control film-read-more"
              aria-expanded={expanded}
              aria-controls={`${id}-copy`}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? 'Show Less' : 'Read Full Synopsis'}
              <ChevronDown size={14} aria-hidden="true" />
            </button>
          </div>
        )}
      </section>
      <section className="film-releases" aria-labelledby={`${id}-releases`} aria-busy={loading}>
        <div className="film-release-panel">
          <div className="film-section-heading">
            <h3 className="film-section-title" id={`${id}-releases`}>
              Home Releases
            </h3>
            {loading && (
              <span>
                <LoaderCircle size={13} className="spin" aria-hidden="true" />
                Checking sources…
              </span>
            )}
          </div>
          {warning && !error && (
            <p className="film-warning" role="status">
              {warning}
            </p>
          )}
          {movie.releases.length ? (
            <div className="film-release-list">
              {movie.releases.map((r) => (
                <div className="film-release" key={r.kind}>
                  <div className="film-release-description">
                    <strong>{r.platform || r.kind}</strong>
                    <p>
                      {r.kind === 'Subscription'
                        ? 'Included with a subscription'
                        : r.kind === 'PVOD'
                          ? 'Premium rental or purchase'
                          : 'Digital rental or purchase'}
                    </p>
                  </div>
                  <div className="film-release-date">
                    <time dateTime={r.date}>{fullDate(r.date)}</time>
                    <span className={`film-release-confidence ${r.confidence}`}>
                      {r.confidence === 'rumored' ? releaseLabels.unconfirmed : 'Date listed'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="film-no-release">
              <CalendarDays size={24} aria-hidden="true" />
              <div>
                <strong>{releaseLabels.unknown}</strong>
                <p>
                  {movie.releaseLookupStatus
                    ? 'We’re still checking the release sources for this film.'
                    : 'No verified digital or subscription date is available in our sources yet.'}{' '}
                  {saved
                    ? movie.watchedAt
                      ? 'It’s in Watched. Mark it as unwatched to include future dates in your calendar.'
                      : 'It’s in your library. Its dates will join your calendar feed when we find them.'
                    : 'Save it to add its dates to your calendar feed when we find them.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
      {sources.length > 0 && (
        <section className="film-sources" aria-label="Sources">
          <div className="film-source-actions">
            {sources.map((source) => (
              <a
                key={source.href}
                className="film-control film-source-button"
                href={source.href}
                target="_blank"
                rel="noreferrer"
                aria-label={`${source.label} — ${source.provider} (opens in a new tab)`}
              >
                <span className="film-source-label">
                  <span>{source.label}</span>
                  <small>{source.provider}</small>
                </span>
                <ExternalLink size={16} aria-hidden="true" />
              </a>
            ))}
          </div>
        </section>
      )}
      {checkedDate && (
        <footer className="film-source-check">
          Sources checked on <time dateTime={checkedDate}>{fullDate(checkedDate)}</time>
        </footer>
      )}
    </article>
  );
}
