'use client';
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
import { calendarRelease } from '../lib/model';
const fullDate = (date: string) =>
  new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
export function CalendarSettings({
  state,
  page,
  ready,
  busy,
}: {
  state: ReturnType<typeof useMovieCalendar>;
  page: LibraryPage;
  ready: boolean;
  busy: boolean;
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
      <h2>Your calendar</h2>
      <p className="calendar-intro">
        Every film in your library is included automatically. Subscribe once; dates update when your
        calendar refreshes.
      </p>
      <div className="calendar-summary">
        <div>
          <strong>{trackedCount}</strong>
          <span>films in your library</span>
        </div>
        <div>
          <strong>{page.listedEvents + (includeRumors ? page.rumoredEvents : 0)}</strong>
          <span>calendar events</span>
        </div>
        <div>
          <strong>US</strong>
          <span>release region</span>
        </div>
      </div>
      {trackedCount === 0 && (
        <p className="calendar-tip">
          Save a film to your library to add its sourced release dates here.
        </p>
      )}
      <p className="calendar-tip">
        <strong>Release-day reminders · 1pm GMT</strong>
        <br />
        Each film has one reminder per release day, combining releases on the same date. Every
        reminder is a 30-minute block from 13:00–13:30 GMT (UTC), with an alert at its start. In
        Apple Calendar, leave “Alerts” unchecked under Remove and turn off “Ignore alerts”. Calendar
        notifications must be enabled on your device.
      </p>
      <label className="preference-row">
        <span>
          <strong>Include unconfirmed dates</strong>
          <small>Unconfirmed dates appear as tentative events.</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={includeRumors}
          disabled={!ready || busy}
          onChange={(e) => void updateRumors(e.target.checked)}
        />
      </label>
      {preferenceError && (
        <p className="inline-error" role="alert">
          {preferenceError} Your previous setting is still selected.
        </p>
      )}
      {!canSubscribe && (
        <div className="subscription-notice">
          <CircleHelp aria-hidden="true" size={18} />
          <p>
            <strong>One hosting step remains.</strong> Apple Calendar needs a feed it can reach
            without a site sign-in. This private preview keeps your library protected; subscription
            access needs to be configured before connecting.
          </p>
        </div>
      )}
      {local && (
        <p className="calendar-tip">
          Local preview: this subscription works only while this development server is running on
          your Mac.
        </p>
      )}
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
            <span aria-hidden="true">Copy feed link</span>
            <span>{copying ? 'Copying…' : copied ? 'Link copied' : 'Copy feed link'}</span>
          </span>
        </button>
        <button
          className="button subtle"
          disabled={!(page.listedEvents + (includeRumors ? page.rumoredEvents : 0))}
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
        In Apple Calendar, choose iCloud to see it across your devices. Event downloads are a
        snapshot; subscriptions update. Keep your feed link private.
      </p>
      {(trackedCount > 0 || trackedError) && (
        <div className="tracked-list">
          <h3>On your calendar</h3>
          <p className="calendar-tip">
            Remove a film from your library to remove its dates from this calendar.
          </p>
          {tracked.map((m) => (
            <div key={m.id}>
              <span>
                {m.title}
                <small>
                  {calendarRelease(m, includeRumors)
                    ? fullDate(calendarRelease(m, includeRumors)!.date)
                    : m.releases.length
                      ? 'Unconfirmed dates excluded'
                      : 'TBA'}
                </small>
              </span>
            </div>
          ))}
          {trackedError && (
            <div className="calendar-load-error" role="alert">
              <p>{trackedError.message}</p>
              <button
                className="button subtle"
                disabled={trackedBusy}
                onClick={() => void loadTracked(trackedError.offset)}
              >
                Try again
              </button>
            </div>
          )}
          {trackedNext !== null && !trackedError && (
            <button
              className="button subtle"
              disabled={trackedBusy}
              onClick={() => loadTracked(trackedNext)}
            >
              More films <ArrowDownToLine aria-hidden="true" size={16} />
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
