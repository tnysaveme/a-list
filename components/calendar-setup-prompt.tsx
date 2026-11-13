'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, X } from 'lucide-react';
import { useExitPresence } from '../hooks/use-exit-presence';

// A browser-local reminder preference, never evidence of an external subscription.
const dismissalKey = 'a-list-calendar-setup-dismissed:v1';

export function CalendarSetupPrompt({ active, onOpen }: { active: boolean; onOpen: () => void }) {
  const [visible, setVisible] = useState(false);
  const open = active && visible;
  const { ref, mounted } = useExitPresence<HTMLElement>(open);
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

  if (!mounted) return null;
  return (
    <aside
      ref={ref}
      className="calendar-setup feedback-surface"
      aria-label="Calendar setup reminder"
      data-state={open ? 'open' : 'closed'}
      inert={!open}
    >
      <div>
        <strong>Get Release Dates in Your Calendar</strong>
        <p>Subscribe once to follow the films you save.</p>
      </div>
      <button className="button subtle" onClick={onOpen}>
        <CalendarDays size={16} aria-hidden="true" />
        Connect Your Calendar
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
