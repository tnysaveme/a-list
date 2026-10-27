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
      <h2>How A-List works</h2>
      <p>
        A-List is your personal library for a film’s next chapter: the moment it comes home in the
        United States.
      </p>
      <h3>Dates with a paper trail</h3>
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
        . Film search and synopses also use{' '}
        <a target="_blank" rel="noreferrer" href="https://www.stremio.com/">
          Cinemeta
        </a>
        . Metadata premiere dates are never used as US home-release dates. Every date links to its
        source. A listed date is a source’s listing, not a guarantee from the studio.
      </p>
      <h3>Different windows, different dates</h3>
      <p>
        PVOD is premium rental or purchase. Digital is a home rental or purchase listing, with no
        assumed price. Subscription means included with a service. We never use a DVD or theatrical
        date as a digital date.
      </p>
      <h3>A calendar that follows along</h3>
      <p>
        Release sources are checked in the background. Saved film dates are scheduled for refresh
        about every six hours, and your calendar receives the latest stored dates whenever it checks
        for updates. Unknown dates stay out of the calendar until a date is listed. Unconfirmed
        dates are optional and marked tentative. Apple decides when to fetch updates.
      </p>
      <h3>Your own little collection</h3>
      <p>
        Your library is saved to your signed-in account. Saving a film automatically adds its
        sourced dates to your calendar. Removing it removes those dates on the next subscription
        refresh. You can undo removal for ten seconds.
      </p>
    </>
  );
}
