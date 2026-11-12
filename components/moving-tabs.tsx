'use client';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { durationMilliseconds } from '../lib/motion-duration';
import { spatialMotionAllowed } from '../lib/content-motion';

export function MovingTabs({
  value,
  className,
  label,
  children,
}: {
  value: string;
  className: 'nav-tabs' | 'filter-list' | 'library-sections';
  label?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLSpanElement>(null);
  const motion = useRef<Animation | null>(null);
  const target = useRef('');
  useLayoutEffect(() => {
    const container = ref.current!;
    const indicator = marker.current!;
    function place(animate: boolean) {
      const selected = container.querySelector<HTMLElement>('button[aria-pressed="true"]');
      if (!selected) return;
      const parent = container.getBoundingClientRect();
      const next = selected.getBoundingClientRect();
      // The mobile filter uses a native select; hidden desktop tabs have no geometry.
      if (!next.width || !next.height) {
        motion.current?.cancel();
        delete container.dataset.indicatorReady;
        target.current = '';
        return;
      }
      const previous = container.dataset.indicatorReady ? indicator.getBoundingClientRect() : null;
      const x = next.left - parent.left + container.scrollLeft;
      const y = className === 'nav-tabs' ? container.clientHeight - 1 : next.top - parent.top;
      const height = className === 'nav-tabs' ? 2 : next.height;
      const geometry = `${x},${y},${next.width},${height}`;
      if (!animate && target.current === geometry) return;
      target.current = geometry;
      const styles = getComputedStyle(document.documentElement);
      const duration = durationMilliseconds(styles.getPropertyValue('--dur-view'), 260);
      const easing = styles.getPropertyValue('--ease-out').trim();
      motion.current?.cancel();
      indicator.style.width = `${next.width}px`;
      indicator.style.height = `${height}px`;
      indicator.style.transform = `translate(${x}px, ${y}px)`;
      container.dataset.indicatorReady = 'true';
      if (previous && animate && spatialMotionAllowed()) {
        motion.current = indicator.animate(
          [
            {
              transform: `translate(${previous.left - parent.left + container.scrollLeft}px, ${previous.top - parent.top}px) scaleX(${previous.width / next.width})`,
            },
            { transform: `translate(${x}px, ${y}px) scaleX(1)` },
          ],
          { duration, easing },
        );
        void motion.current.finished.catch(() => {});
      }
    }
    place(true);
    const observer = new ResizeObserver(() => place(false));
    observer.observe(container);
    for (const button of container.querySelectorAll('button')) observer.observe(button);
    return () => {
      observer.disconnect();
    };
  }, [value, className]);
  useLayoutEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const cancel = () => motion.current?.cancel();
    document.addEventListener('keydown', cancel, true);
    preference.addEventListener('change', cancel);
    return () => {
      cancel();
      document.removeEventListener('keydown', cancel, true);
      preference.removeEventListener('change', cancel);
    };
  }, []);
  return (
    <div ref={ref} className={className} aria-label={label}>
      <span ref={marker} className="moving-tab-indicator" aria-hidden="true" />
      {children}
    </div>
  );
}
