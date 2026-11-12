'use client';
import { X } from 'lucide-react';
export function AboutContent({ onClose }: { onClose: () => void }) {
  return (
    <>
      <button
        className="dialog-close icon-button"
        aria-label="Close information"
        onClick={() => onClose()}
      >
        <X aria-hidden="true" size={20} />
      </button>
      <h2>How A-List Works</h2>
      <p>
        Save the films you want to see and follow their digital and streaming releases. A-List
        tracks movies, not TV series.
      </p>
      <h3>Dates with a Paper Trail</h3>
      <p>
        Digital listings come from{' '}
        <a
          target="_blank"
          rel="noreferrer"
          href="https://www.dvdsreleasedates.com/digital-releases/"
        >
          DVDs Release Dates
        </a>
        . Additional digital and subscription reporting comes from{' '}
        <a target="_blank" rel="noreferrer" href="https://whentostream.com/">
          When To Stream
        </a>
        . We check that a When To Stream listing belongs to the right film before using its dates.
        Each release date links to its source. A listed date is a source’s listing, not a guarantee
        from the studio.
      </p>
      <p>
        Film search and synopses also use{' '}
        <a target="_blank" rel="noreferrer" href="https://www.stremio.com/">
          Cinemeta
        </a>
        . Release dates follow US listings; availability elsewhere may differ.
      </p>
      <h3>Different Windows, Different Dates</h3>
      <p>
        PVOD is premium rental or purchase. Digital is a home rental or purchase listing, with no
        assumed price. Subscription means included with a service. “Available” means a listed
        release date has arrived; availability and pricing can still vary by service. We never use a
        DVD, theatrical or metadata premiere date as a digital date.
      </p>
      <p>
        Coming Soon shows future release windows. A film available to rent may still appear there
        for a later subscription release. Dates roll over at midnight Eastern Time, following our
        source listings.
      </p>
      <p>
        TBA means we don’t have a verified home-release date to show yet. You can still save the
        film. We keep checking, and we keep the last saved dates if a source is temporarily
        unavailable. Dates can change as sources update their listings.
      </p>
      <h3>A Calendar That Follows Along</h3>
      <p>
        Films in To Watch add their sourced dates to your private calendar feed. Marking a film
        watched keeps it in your library and removes its calendar events. Mark it as unwatched to
        restore them. Open Calendar Settings and subscribe once to see them in your calendar app.
        Source checks run in the background; your calendar app decides when to fetch the latest
        dates. Films without dates stay in your library and appear in the feed when a date is found.
        You can include or exclude unconfirmed dates; days with only unconfirmed releases are marked
        tentative.
      </p>
      <p>
        Each film gets one reminder per release day, combining releases on the same date. Reminders
        run from 13:00–13:30 GMT (UTC), with an alert at the start if your calendar allows alerts.
        This is a reminder time, not the time a film becomes available. Downloaded calendars are
        snapshots; subscriptions receive updates.
      </p>
      <h3>Your Own Little Collection</h3>
      <p>
        Your library belongs to your signed-in account. Save controls respond immediately; “Saving…”
        means the change is still being confirmed. If a save fails, we show an error so you can
        retry. Removing a film removes its dates on the next subscription refresh. Undo is available
        in the removal message for ten seconds. Account Settings lets you export your library, reset
        your private calendar link or delete your account.
      </p>
    </>
  );
}
