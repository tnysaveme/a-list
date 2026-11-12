'use client';
import { useLayoutEffect, useRef, useState } from 'react';

/** Keep a surface mounted until CSS transitions finish; reversal cancels removal. */
export function useExitPresence<T extends HTMLElement>(open: boolean, onExited?: () => void) {
  const ref = useRef<T>(null);
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  useLayoutEffect(() => {
    if (open || !mounted || !ref.current) return;
    let cancelled = false;
    // Flush closed styles without waiting on descendant loading spinners.
    const transitions = ref.current.getAnimations();
    void Promise.allSettled(transitions.map((animation) => animation.finished)).then(() => {
      if (!cancelled) {
        setMounted(false);
        onExited?.();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, mounted, onExited]);
  return { ref, mounted };
}

/** Retain the last visible content during exit without reading refs in render. */
export function useExitContent<T>(content: T, open: boolean) {
  const [snapshot, setSnapshot] = useState({ content });
  if (open && snapshot.content !== content) setSnapshot({ content });
  return open ? content : snapshot.content;
}
