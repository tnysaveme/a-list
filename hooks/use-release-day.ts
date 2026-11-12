'use client';
import { useEffect, useState } from 'react';
import { releaseDay } from '../lib/release-day';

/** Keep an open or resumed tab current even when no source data has changed. */
export function useReleaseDay(initialDay: string) {
  const [day, setDay] = useState(initialDay);
  useEffect(() => {
    let active = true;
    const update = () => {
      if (active && document.visibilityState === 'visible') setDay(releaseDay());
    };
    queueMicrotask(update);
    const timer = setInterval(update, 30_000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return day;
}
