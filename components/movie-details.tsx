'use client';
import { useId, useState } from 'react';
import {
  Bookmark,
  CalendarDays,
  Check,
  ChevronDown,
  ExternalLink,
  LoaderCircle,
  Plus,
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
  movie: Movie;
  saved: boolean;
  ready: boolean;
  busy: boolean;
  loading: boolean;
  error: string;
  onSave: () => void;
  onRemove: () => void;
  onClose: () => void;
};

export function MovieDetails({
  movie,
  saved,
  ready,
  busy,
  loading,
  error,
  onSave,
  onRemove,
  onClose,
}: MovieDetailsProps) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const series = movie.mediaType === 'series';
  const release = displayRelease(movie);
  const available = !!availableRelease(movie);
  const collapsible = !!movie.overview && movie.overview.length > 180;
  const checked = movie.releaseCheckedAt
    ? `Sources checked ${fullDate(movie.releaseCheckedAt.slice(0, 10))}`
    : movie.id.startsWith('tt')
      ? 'Release date not verified'
      : `Last checked ${fullDate(movie.checkedAt.slice(0, 10))}`;
  const warning = error || (!loading ? releaseStatusNotice(movie) : undefined);
  return (
    <article className="film-details">
      <button className="film-close film-control" aria-label="Close film details" onClick={onClose}>
        <X size={20} aria-hidden="true" />
      </button>
      <header className={`film-header ${movie.title.length > 44 ? 'film-header-long' : ''}`}>
        <FilmPoster
          className="film-poster"
          src={movie.poster}
          alt={`${movie.title} poster`}
          width={160}
          height={240}
          sizes="(min-width: 640px) 112px, 72px"
        />
        <div className="film-heading">
          <p className="film-metadata">{[movie.year, movie.rating].filter(Boolean).join(' · ')}</p>
          <h2>{movie.title}</h2>
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
      <div className="film-library">
        <p>
          <Bookmark size={18} aria-hidden="true" />
          <span>
            {saved ? 'In your library' : 'Keep this film on your radar'}
            <small id={series ? `${id}-movie-only` : undefined}>
              {series
                ? 'A-List tracks movies only. TV series are not supported.'
                : saved
                  ? 'Sourced dates are included in your calendar.'
                  : 'Save it to add sourced dates to your calendar.'}
            </small>
          </span>
        </p>
        {saved ? (
          <button
            className="film-control film-saved"
            data-autofocus
            disabled={busy}
            aria-busy={busy}
            data-state={busy ? 'loading' : 'success'}
            onClick={onRemove}
          >
            {busy ? (
              <LoaderCircle size={16} className="spin" aria-hidden="true" />
            ) : (
              <Check size={16} aria-hidden="true" />
            )}
            <span>{busy ? 'Removing…' : 'Saved to library'}</span>
            {!busy && <Trash2 className="film-remove-icon" size={14} aria-hidden="true" />}
            <span className="sr-only"> — remove from library</span>
          </button>
        ) : (
          <button
            className="film-control film-save"
            data-autofocus
            disabled={!ready || busy || series}
            aria-describedby={series ? `${id}-movie-only` : undefined}
            aria-busy={busy}
            data-state={busy ? 'loading' : undefined}
            onClick={onSave}
          >
            {busy ? (
              <LoaderCircle size={16} className="spin" aria-hidden="true" />
            ) : (
              <Plus size={16} aria-hidden="true" />
            )}
            {series ? 'Movies only' : busy ? 'Saving…' : 'Save to library'}
          </button>
        )}
      </div>
      <section className="film-releases" aria-labelledby={`${id}-releases`} aria-busy={loading}>
        <div className="film-section-heading">
          <h3 id={`${id}-releases`}>Home releases</h3>
          <span>
            {loading ? (
              <>
                <LoaderCircle size={13} className="spin" aria-hidden="true" />
                Checking sources…
              </>
            ) : (
              'United States'
            )}
          </span>
        </div>
        {warning && (
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
                <a
                  className="film-control film-source"
                  href={r.source}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${r.sourceName}: ${r.platform || r.kind} release source (opens in a new tab)`}
                >
                  {r.sourceName}
                  <ExternalLink size={14} aria-hidden="true" />
                </a>
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
                  ? 'We’re checking sources for a verifiable US home release date. Save the film and its sourced dates will join your calendar when verified.'
                  : 'No US digital or subscription date is listed yet. Save the film and its sourced dates will join your calendar when they appear.'}
              </p>
            </div>
          </div>
        )}
        <footer className="film-source-footer">
          <p>
            {checked}
            <span>Release dates can change.</span>
          </p>
          <a
            className="film-control film-source"
            href={movie.source}
            target="_blank"
            rel="noreferrer"
          >
            View source
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        </footer>
      </section>
      <section className="film-synopsis" aria-labelledby={`${id}-synopsis`}>
        <h3 id={`${id}-synopsis`}>Synopsis</h3>
        <p
          id={`${id}-copy`}
          className={`film-overview ${collapsible && !expanded ? 'film-overview-collapsed' : ''}`}
          aria-live="polite"
        >
          {movie.overview ||
            (loading
              ? 'Loading the synopsis…'
              : 'A synopsis isn’t available from our sources yet.')}
        </p>
        {(collapsible || (movie.overview && movie.overviewSource)) && (
          <div className="film-synopsis-actions">
            {collapsible && (
              <button
                className="film-control film-read-more"
                aria-expanded={expanded}
                aria-controls={`${id}-copy`}
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? 'Show less' : 'Read full synopsis'}
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            )}
            {movie.overview && movie.overviewSource && (
              <a
                className="film-control film-source"
                href={movie.overviewSource}
                target="_blank"
                rel="noreferrer"
              >
                Synopsis source
                <ExternalLink size={14} aria-hidden="true" />
              </a>
            )}
          </div>
        )}
      </section>
    </article>
  );
}
