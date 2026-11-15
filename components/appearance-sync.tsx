'use client';

import { useEffect } from 'react';
import {
  APPEARANCE_KEY,
  DARK_MEDIA,
  applyAppearance,
  currentAppearance,
  storedAppearance,
  stopAppearanceTransition,
} from '../lib/appearance';

/** Keeps system changes and other tabs in sync even while Settings is closed. */
export function AppearanceSync() {
  useEffect(() => {
    applyAppearance(storedAppearance());
    const media = window.matchMedia(DARK_MEDIA);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onSystemChange = () => {
      if (currentAppearance() === 'system') applyAppearance('system', true);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== APPEARANCE_KEY && event.key !== null) return;
      applyAppearance(storedAppearance(), true);
    };
    const onReducedChange = () => {
      if (reduced.matches) stopAppearanceTransition();
    };
    media.addEventListener('change', onSystemChange);
    reduced.addEventListener('change', onReducedChange);
    window.addEventListener('storage', onStorage);
    return () => {
      media.removeEventListener('change', onSystemChange);
      reduced.removeEventListener('change', onReducedChange);
      window.removeEventListener('storage', onStorage);
      stopAppearanceTransition();
    };
  }, []);
  return null;
}
