'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, X } from 'lucide-react';

// A browser-local reminder preference, never evidence of an external subscription.
const dismissalKey = 'a-list-calendar-setup-dismissed:v1';

export function CalendarSetupPrompt({ active, onOpen }: { active: boolean; onOpen: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        setVisible(localStorage.getItem(dismissalKey) !== 'true');
      } catch {
        setVisible(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!active || !visible) return null;
  return (
    <aside className="calendar-setup" aria-label="Calendar setup reminder">
      <div>
        <strong>Get release dates in your calendar</strong>
        <p>Subscribe once to follow the films you save.</p>
      </div>
      <button className="button subtle" onClick={onOpen}>
        <CalendarDays size={16} aria-hidden="true" />
        Connect your calendar
      </button>
      <button
        className="icon-button"
        aria-label="Dismiss calendar setup reminder"
        onClick={() => {
          setVisible(false);
          try {
            localStorage.setItem(dismissalKey, 'true');
          } catch {
            /* Dismissal still works for this visit when storage is unavailable. */
          }
          document
            .querySelector<HTMLButtonElement>('.app-header-calendar')
            ?.focus({ preventScroll: true });
        }}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </aside>
  );
}
