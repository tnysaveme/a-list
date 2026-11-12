'use client';
import { useCallback, useLayoutEffect, useRef } from 'react';

/** One measurement before a refresh commit, one restoration after React lays it out. */
export function useCollectionAnchor(items: unknown) {
  const pending = useRef<{ id: string; top: number }[]>([]);
  useLayoutEffect(() => {
    const anchors = pending.current;
    pending.current = [];
    for (const anchor of anchors) {
      const element = document.querySelector<HTMLElement>(
        `[data-movie-id="${CSS.escape(anchor.id)}"]`,
      );
      if (element) {
        const delta = element.getBoundingClientRect().top - anchor.top;
        if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: 'instant' });
        break;
      }
    }
  }, [items]);
  return useCallback(() => {
    pending.current = [];
    for (const element of document.querySelectorAll<HTMLElement>('[data-movie-id]')) {
      const rect = element.getBoundingClientRect();
      if (rect.top >= window.innerHeight) break;
      if (rect.bottom > 0) pending.current.push({ id: element.dataset.movieId!, top: rect.top });
    }
  }, []);
}
