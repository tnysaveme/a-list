'use client';
import { flushSync } from 'react-dom';
import { durationMilliseconds } from './motion-duration';

type Kind = 'forward' | 'back' | 'results';
let input: 'pointer' | 'keyboard' = 'keyboard';
let active: { transition: ViewTransition; kind: Kind } | null = null;
const layoutAnimations = new Set<Animation>();
const contentAnimations = new Set<Animation>();
let layoutVersion = 0;

export function pointerMotionAllowed() {
  return input === 'pointer';
}

export function installMotionInput() {
  input = 'keyboard';
  document.documentElement.dataset.motionInput = input;
  const pointer = () => {
    input = 'pointer';
    if (document.documentElement.dataset.motionInput !== input)
      document.documentElement.dataset.motionInput = input;
  };
  const keyboard = () => {
    input = 'keyboard';
    if (document.documentElement.dataset.motionInput !== input)
      document.documentElement.dataset.motionInput = input;
  };
  document.addEventListener('pointerdown', pointer, true);
  document.addEventListener('keydown', keyboard, true);
  return () => {
    document.removeEventListener('pointerdown', pointer, true);
    document.removeEventListener('keydown', keyboard, true);
    active?.transition.skipTransition();
    for (const animation of layoutAnimations) animation.cancel();
    for (const animation of contentAnimations) animation.cancel();
  };
}

export function spatialMotionAllowed() {
  return input === 'pointer' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function timing(token: string, fallback: number) {
  return durationMilliseconds(
    getComputedStyle(document.documentElement).getPropertyValue(token),
    fallback,
  );
}
function easing() {
  return (
    getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim() ||
    'cubic-bezier(0.16, 1, 0.3, 1)'
  );
}
function animate(
  element: HTMLElement,
  frames: Keyframe[],
  duration: number,
  registry?: Set<Animation>,
  curve = easing(),
) {
  const animation = element.animate(frames, { duration, easing: curve });
  registry?.add(animation);
  void animation.finished.then(
    () => registry?.delete(animation),
    () => registry?.delete(animation),
  );
  return animation;
}

/** Snapshot only the changing content; navigation/focus never sits behind an input-blocking layer. */
export async function transitionContent(update: () => void, kind: Kind, valid = () => true) {
  let committed = false;
  const commit = () => {
    if (!valid()) return;
    flushSync(update);
    committed = true;
  };
  if (typeof document === 'undefined' || input === 'keyboard') {
    active?.transition.skipTransition();
    for (const animation of contentAnimations) animation.cancel();
    commit();
    return committed;
  }
  // A fast data response must not cancel the user's section-navigation transaction.
  if (kind === 'results' && active && active.kind !== 'results') {
    commit();
    return committed;
  }
  for (const animation of layoutAnimations) animation.cancel();
  for (const animation of contentAnimations) animation.cancel();
  const fallback = () => {
    if (!committed) commit();
    if (!committed) return false;
    const curve = easing();
    const nodes = document.querySelectorAll<HTMLElement>(
      kind === 'results' ? '.collection-results' : '.intro, .section-content',
    );
    const reduced = !spatialMotionAllowed();
    for (const node of nodes)
      animate(
        node,
        [
          {
            opacity: 0,
            transform: reduced
              ? 'none'
              : `translateX(${kind === 'back' ? -24 : kind === 'results' ? 0 : 24}px) translateY(${kind === 'results' ? 12 : 0}px)`,
          },
          { opacity: 1, transform: 'none' },
        ],
        reduced
          ? 120
          : kind === 'results'
            ? timing('--dur-results', 220)
            : timing('--dur-view', 260),
        contentAnimations,
        curve,
      );
    return committed;
  };
  if (!document.startViewTransition) return fallback();
  active?.transition.skipTransition();
  document.documentElement.dataset.contentMotion = kind;
  let transition: ViewTransition;
  try {
    transition = document.startViewTransition(commit);
  } catch {
    delete document.documentElement.dataset.contentMotion;
    return fallback();
  }
  active = { transition, kind };
  // A skipped/interrupted snapshot rejects ready, but its state update still has to run.
  void transition.ready.catch(() => {});
  const cleanup = () => {
    if (active?.transition === transition) {
      active = null;
      delete document.documentElement.dataset.contentMotion;
    }
  };
  void transition.finished.then(cleanup, cleanup);
  try {
    await transition.updateCallbackDone;
  } catch {
    if (!committed) commit();
  }
  return committed;
}

/** FLIP positions and artwork only. Text is never scaled into a different layout. */
export function transitionLayout(update: () => void) {
  active?.transition.skipTransition();
  const grid = document.querySelector<HTMLElement>('.movie-grid');
  if (!grid || !spatialMotionAllowed()) {
    for (const animation of layoutAnimations) animation.cancel();
    flushSync(update);
    if (grid && input === 'pointer') animate(grid, [{ opacity: 0.65 }, { opacity: 1 }], 120);
    return;
  }
  const version = ++layoutVersion;
  const snapshots = [...grid.querySelectorAll<HTMLElement>('.movie-card')]
    .slice(0, 24)
    .map((card) => {
      const poster = card.querySelector<HTMLElement>('.poster-button')!;
      return {
        card,
        poster,
        before: card.getBoundingClientRect(),
        artwork: poster.getBoundingClientRect(),
      };
    });
  for (const animation of layoutAnimations) animation.cancel();
  flushSync(update);
  // Batch all target reads before the first animation write.
  const targets = snapshots.map((snapshot) => ({
    ...snapshot,
    after: snapshot.card.getBoundingClientRect(),
    targetArtwork: snapshot.poster.getBoundingClientRect(),
  }));
  const duration = timing('--dur-layout', 280);
  const curve = easing();
  grid.dataset.layoutAnimating = 'true';
  const animations: Animation[] = [];
  for (const { card, poster, before, artwork, after, targetArtwork } of targets) {
    if (
      Math.min(before.top, after.top) > innerHeight + 200 ||
      Math.max(before.bottom, after.bottom) < -200
    )
      continue;
    animations.push(
      animate(
        card,
        [
          { transform: `translate(${before.left - after.left}px, ${before.top - after.top}px)` },
          { transform: 'translate(0px, 0px)' },
        ],
        duration,
        layoutAnimations,
        curve,
      ),
    );
    poster.style.transformOrigin = 'top left';
    animations.push(
      animate(
        poster,
        [
          {
            transform: `translate(${artwork.left - before.left - targetArtwork.left + after.left}px, ${artwork.top - before.top - targetArtwork.top + after.top}px) scale(${artwork.width / targetArtwork.width})`,
          },
          { transform: 'translate(0px, 0px) scale(1)' },
        ],
        duration,
        layoutAnimations,
        curve,
      ),
    );
    for (const info of card.querySelectorAll<HTMLElement>(
      '.movie-info, .save-button, .poster-checkbox',
    )) {
      animations.push(
        animate(info, [{ opacity: 0 }, { opacity: 1 }], duration, layoutAnimations, curve),
      );
    }
  }
  void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
    if (version === layoutVersion) delete grid.dataset.layoutAnimating;
  });
}
