'use client';
import { useLayoutEffect, useRef } from 'react';
import { pointerMotionAllowed } from '../lib/content-motion';
import { durationMilliseconds } from '../lib/motion-duration';

/** Small, occasional state changes; keyboard/focus and data commits never wait. */
export function useStateEntrance<T extends HTMLElement>(active: boolean, distance = 4) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!active || !node || !pointerMotionAllowed()) return;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const styles = getComputedStyle(document.documentElement);
    const animation = node.animate(
      [
        { opacity: 0, transform: preference.matches ? 'none' : `translateY(${distance}px)` },
        { opacity: 1, transform: 'none' },
      ],
      {
        duration: durationMilliseconds(
          styles.getPropertyValue(preference.matches ? '--dur-short' : '--dur-medium'),
          preference.matches ? 120 : 180,
        ),
        easing: styles.getPropertyValue('--ease-out').trim(),
      },
    );
    const cancel = () => animation.cancel();
    preference.addEventListener('change', cancel);
    document.addEventListener('keydown', cancel, true);
    return () => {
      cancel();
      preference.removeEventListener('change', cancel);
      document.removeEventListener('keydown', cancel, true);
    };
  }, [active, distance]);
  return ref;
}
