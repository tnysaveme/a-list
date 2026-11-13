'use client';
import { releaseDay } from '../lib/release-day';
import {
  ArrowDownToLine,
  ArrowUpRight,
  CalendarDays,
  Check,
  CircleHelp,
  ExternalLink,
  LoaderCircle,
  X,
} from 'lucide-react';
import type { useMovieCalendar } from '../hooks/use-movie-calendar';
import type { LibraryPage } from '../lib/pagination';
import { calendarRelease, type Movie } from '../lib/model';
const fullDate = (date: string) =>
  new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
export function CalendarSettings({
  state,
  currentDay = releaseDay(),
  page,
  ready,
  busy,
  onOpenMovie,
}: {
  state: ReturnType<typeof useMovieCalendar>;
  currentDay?: string;
  page: LibraryPage;
  ready: boolean;
  busy: boolean;
  onOpenMovie: (movie: Movie) => void;
}) {
  const {
    setCalendar,
    includeRumors,
    copied,
    tracked,
    trackedNext,
    trackedBusy,
    loadTracked,
    updateRumors,
    download,
    copyFeed,
    trackedError,
    preferenceError,
    copyError,
    copying,
  } = state;
  const trackedCount = page.trackedCount,
    canSubscribe = state.feedPublic;
  const eventCount = page.listedEvents + (includeRumors ? page.rumoredEvents : 0);
  const local =
    typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const feedUrl =
    typeof window !== 'undefined' && state.feedPath
      ? new URL(state.feedPath, window.location.origin).href
      : '';
  return (
    <>
      <button
        className="dialog-close icon-button"
        aria-label="Close calendar settings"
        onClick={() => setCalendar(false)}
      >
        <X aria-hidden="true" size={20} />
      </button>
      <span className="dialog-emblem">
        <CalendarDays aria-hidden="true" size={28} />
      </span>
      <h2>Your Calendar</h2>
      <p className="calendar-intro">
        Films in To Watch are included in your private feed. Watched films are excluded. Subscribe
        once to see their release dates in your calendar.
      </p>
      {trackedCount === 0 && (
        <p className="calendar-tip">
          {page.total > 0
            ? 'Mark a film as unwatched to include its release dates here.'
            : 'Save a film to your library to add its sourced release dates here.'}
        </p>
      )}
      {!canSubscribe && (
        <div className="subscription-notice">
          <CircleHelp aria-hidden="true" size={18} />
          <p>
            <strong>Subscriptions are unavailable right now.</strong> You can still download a
            calendar snapshot. Try subscribing again later.
          </p>
        </div>
      )}
      <p className="calendar-reminder-note">
        US release dates · 30-minute reminders at 1pm GMT (UTC), with an alert if your calendar
        allows it. This is a reminder time, not the film’s availability time.
      </p>
      <a
        className={`button primary subscribe-button ${!ready || !trackedCount || !canSubscribe ? 'disabled' : ''}`}
        aria-disabled={!ready || !trackedCount || !canSubscribe}
        href={
          ready && trackedCount && canSubscribe ? feedUrl.replace(/^https?:/, 'webcal:') : undefined
        }
        onClick={(e) => {
          if (!ready || !trackedCount || !canSubscribe) e.preventDefault();
        }}
      >
        <CalendarDays aria-hidden="true" size={17} />
        Subscribe in Apple Calendar
        <ArrowUpRight aria-hidden="true" size={16} />
      </a>
      <div className="calendar-secondary">
        <button
          className="button subtle copy-feed-button"
          data-state={copied ? 'success' : undefined}
          disabled={copying || !ready || !trackedCount || !canSubscribe}
          aria-busy={copying}
          onClick={() => void copyFeed()}
        >
          <span className="copy-feed-icon" data-copied={copied} aria-hidden="true">
            <ExternalLink size={15} className="copy-link-icon" />
            <Check size={15} className="copy-check-icon" />
          </span>
          <span className="copy-feed-label">
            <span aria-hidden="true">Copy Feed Link</span>
            <span>{copying ? 'Copying…' : copied ? 'Link Copied' : 'Copy Feed Link'}</span>
          </span>
        </button>
        <button
          className="button subtle"
          disabled={
            state.settingsBusy || !(page.listedEvents + (includeRumors ? page.rumoredEvents : 0))
          }
          onClick={() => download()}
        >
          <ArrowDownToLine aria-hidden="true" size={15} />
          Download .ics
        </button>
      </div>
      <span className="sr-only" role="status">
        {copied ? 'Calendar link copied.' : copying ? 'Copying calendar link…' : ''}
      </span>
      {copyError && (
        <p className="inline-error" role="alert">
          {copyError}
        </p>
      )}
      <p className="calendar-footnote">
        Keep your feed link private. Downloads are a snapshot; subscriptions update.
      </p>
      <div className="calendar-summary">
        <div>
          <strong>{trackedCount}</strong>
          <span>{trackedCount === 1 ? 'film' : 'films'} in your feed</span>
        </div>
        <div>
          <strong>{eventCount}</strong>
          <span>calendar {eventCount === 1 ? 'event' : 'events'}</span>
        </div>
      </div>
      <details className="calendar-help">
        <summary>Setup Help</summary>
        <p className="calendar-tip">
          <strong>Release-day reminders · 1pm GMT</strong>
          <br />
          Each film has one reminder per release day, combining releases on the same date. Every
          reminder is a 30-minute block from 13:00–13:30 GMT (UTC), with an alert at its start. In
          Apple Calendar, leave “Alerts” unchecked under Remove and turn off “Ignore alerts”.
          Calendar notifications must be enabled on your device.
        </p>
        <p className="calendar-tip">
          In Apple Calendar, choose iCloud to see the subscription across your devices. Dates update
          when your calendar refreshes.
        </p>
        {local && (
          <p className="calendar-tip">
            Local preview: this subscription works only while this development server is running on
            your Mac.
          </p>
        )}
      </details>
      <label className="preference-row">
        <span>
          <strong>Include Unconfirmed Dates</strong>
          <small>Unconfirmed dates appear as tentative events.</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={includeRumors}
          aria-busy={state.settingsBusy}
          disabled={!ready || busy}
          onChange={(e) => void updateRumors(e.target.checked)}
        />
      </label>
      <span className="sr-only" role="status">
        {state.settingsBusy ? 'Saving calendar preference…' : ''}
      </span>
      {preferenceError && (
        <p className="inline-error" role="alert">
          {preferenceError}
        </p>
      )}
      {(trackedCount > 0 || trackedError) && (
        <div className="tracked-list">
          <h3>Included in Your Feed</h3>
          <p className="calendar-tip">
            Mark a film as watched or remove it from your library to remove its dates from this
            feed.
          </p>
          {tracked.map((m) => {
            const release = calendarRelease(m, includeRumors, currentDay);
            return (
              <div key={m.id}>
                <button className="tracked-film" onClick={() => onOpenMovie(m)}>
                  <span>
                    <span>
                      {m.title}
                      {m.year ? ` (${m.year})` : ''}
                    </span>
                    <small>
                      {release
                        ? fullDate(release.date)
                        : m.releases.length
                          ? 'Unconfirmed dates excluded'
                          : 'TBA'}
                      {release?.confidence === 'rumored' && (
                        <span className="release-unconfirmed"> · Unconfirmed</span>
                      )}
                    </small>
                  </span>
                  <ArrowUpRight size={16} aria-hidden="true" />
                </button>
              </div>
            );
          })}
          {trackedError && (
            <div className="calendar-load-error" role="alert">
              <p>{trackedError.message}</p>
              <button
                className="button subtle"
                disabled={trackedBusy}
                onClick={() => void loadTracked(trackedError.offset)}
              >
                Try Again
              </button>
            </div>
          )}
          {trackedNext !== null && !trackedError && (
            <button
              className="button subtle"
              disabled={trackedBusy}
              onClick={() => loadTracked(trackedNext)}
            >
              More Films <ArrowDownToLine aria-hidden="true" size={16} />
            </button>
          )}
          {trackedBusy && (
            <p role="status">
              <LoaderCircle size={16} aria-hidden="true" className="spin" /> Opening your films…
            </p>
          )}
        </div>
      )}
    </>
  );
}
