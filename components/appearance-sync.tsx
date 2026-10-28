'use client';

import { useEffect } from 'react';
import {
  APPEARANCE_EVENT,
  APPEARANCE_KEY,
  DARK_MEDIA,
  applyAppearance,
  currentAppearance,
  storedAppearance,
} from '../lib/appearance';

/** Keeps system changes and other tabs in sync even while Settings is closed. */
export function AppearanceSync() {
  useEffect(() => {
    applyAppearance(storedAppearance());
    const media = window.matchMedia(DARK_MEDIA);
    const onSystemChange = () => {
      if (currentAppearance() === 'system') applyAppearance('system');
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== APPEARANCE_KEY && event.key !== null) return;
      applyAppearance(storedAppearance());
      window.dispatchEvent(new Event(APPEARANCE_EVENT));
    };
    media.addEventListener('change', onSystemChange);
    window.addEventListener('storage', onStorage);
    return () => {
      media.removeEventListener('change', onSystemChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return null;
}
