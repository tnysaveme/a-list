'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Wordmark } from './wordmark';
import { durationMilliseconds } from '../lib/motion-duration';

const arrivalStorage = 'a-list:last-welcome';

/** A one-time sign-in greeting. CSS finishes the reveal even before hydration. */
export function WelcomeArrival({
  arrivalId,
  children,
}: {
  arrivalId: string | null;
  children: ReactNode;
}) {
  const [active, setActive] = useState(!!arrivalId);
  const checkedArrival = useRef(false);
  const finish = useCallback(() => setActive(false), []);
  const attachSplash = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !arrivalId || checkedArrival.current) return;
      checkedArrival.current = true;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        finish();
        return;
      }
      try {
        if (sessionStorage.getItem(arrivalStorage) === arrivalId) finish();
      } catch {
        // The URL is also cleared, so unavailable storage never blocks the library.
      }
    },
    [arrivalId, finish],
  );
  useEffect(() => {
    if (!arrivalId) return;
    try {
      sessionStorage.setItem(arrivalStorage, arrivalId);
    } catch {}
    const url = new URL(location.href);
    if (url.searchParams.get('welcome') === arrivalId) {
      url.searchParams.delete('welcome');
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    }
  }, [arrivalId]);
  useEffect(() => {
    if (!active) return;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const onPreference = () => {
      if (preference.matches) finish();
    };
    document.addEventListener('keydown', finish, true);
    document.addEventListener('pointerdown', finish, true);
    preference.addEventListener('change', onPreference);
    // Animation events can be lost when a tab is backgrounded or styles are replaced.
    const styles = getComputedStyle(document.documentElement);
    const hold = durationMilliseconds(styles.getPropertyValue('--dur-welcome-hold'), 1600);
    const fade = durationMilliseconds(styles.getPropertyValue('--dur-welcome-fade'), 800);
    const fallback = setTimeout(finish, hold + fade + 500);
    return () => {
      clearTimeout(fallback);
      document.removeEventListener('keydown', finish, true);
      document.removeEventListener('pointerdown', finish, true);
      preference.removeEventListener('change', onPreference);
    };
  }, [active, finish]);
  return (
    <div className="welcome-arrival" data-active={active || undefined}>
      {active && (
        <div
          ref={attachSplash}
          className="welcome-splash"
          role="status"
          aria-label="Welcome to A-List"
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) finish();
          }}
        >
          <div className="welcome-splash-copy" aria-hidden="true">
            <Wordmark />
            <p className="welcome-greeting">Welcome home.</p>
            <p className="welcome-tagline">Cinema at home</p>
          </div>
        </div>
      )}
      <div className="welcome-site">{children}</div>
    </div>
  );
}
