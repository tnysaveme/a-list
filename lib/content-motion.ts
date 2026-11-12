'use client';
import { flushSync } from 'react-dom';
import { durationMilliseconds } from './motion-duration';

type Kind = 'forward' | 'back' | 'results' | 'shelf';
let input: 'pointer' | 'keyboard' = 'keyboard';
let active: { kind: Kind; version: number } | null = null;
let contentVersion = 0;
const layoutAnimations = new Set<Animation>();
const contentAnimations = new Set<Animation>();
let layoutVersion = 0;
let layoutGrid: HTMLElement | null = null;

function stopLayoutMotion() {
  layoutVersion++;
  for (const animation of layoutAnimations) animation.cancel();
  layoutAnimations.clear();
  if (layoutGrid) delete layoutGrid.dataset.layoutAnimating;
  layoutGrid = null;
}

function stopContentMotion() {
  contentVersion++;
  active = null;
  if (typeof document !== 'undefined') delete document.documentElement.dataset.contentMotion;
  for (const animation of contentAnimations) animation.cancel();
  contentAnimations.clear();
}

export function pointerMotionAllowed() {
  return input === 'pointer';
}

export function installMotionInput() {
  input = 'keyboard';
  document.documentElement.dataset.motionInput = input;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const stop = () => {
    stopLayoutMotion();
    stopContentMotion();
  };
  const pointer = () => {
    input = 'pointer';
    if (document.documentElement.dataset.motionInput !== input)
      document.documentElement.dataset.motionInput = input;
  };
  const keyboard = () => {
    input = 'keyboard';
    if (document.documentElement.dataset.motionInput !== input)
      document.documentElement.dataset.motionInput = input;
    stop();
  };
  preference.addEventListener('change', stop);
  document.addEventListener('pointerdown', pointer, true);
  document.addEventListener('keydown', keyboard, true);
  return () => {
    document.removeEventListener('pointerdown', pointer, true);
    document.removeEventListener('keydown', keyboard, true);
    preference.removeEventListener('change', stop);
    stop();
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

/** Animate live content so image decoding and incoming data remain visible throughout. */
export async function transitionContent(update: () => void, kind: Kind, valid = () => true) {
  if (!valid()) return false;
  if (typeof document === 'undefined' || input === 'keyboard') {
    stopContentMotion();
    flushSync(update);
    return true;
  }
  // Let results arrive inside a running section transition without a second entrance.
  if (
    (kind === 'results' || kind === 'shelf') &&
    active &&
    (active.kind === 'forward' || active.kind === 'back')
  ) {
    flushSync(update);
    return true;
  }
  const previous = new Map<HTMLElement, Keyframe>();
  for (const animation of contentAnimations) {
    const node = (animation.effect as KeyframeEffect | null)?.target;
    if (node instanceof HTMLElement) {
      const style = getComputedStyle(node);
      previous.set(node, { opacity: style.opacity, transform: style.transform });
    }
  }
  stopLayoutMotion();
  stopContentMotion();
  flushSync(update);
  const version = contentVersion;
  const reduced = !spatialMotionAllowed();
  const duration = reduced
    ? timing('--dur-short', 120)
    : kind === 'results' || kind === 'shelf'
      ? timing('--dur-results', 220)
      : timing('--dur-view', 260);
  const nodes = document.querySelectorAll<HTMLElement>(
    kind === 'shelf'
      ? '.library-content'
      : kind === 'results'
        ? '.collection-results'
        : '.intro, .section-content',
  );
  const animations: Animation[] = [];
  active = { kind, version };
  document.documentElement.dataset.contentMotion = kind;
  const curve = easing();
  for (const node of nodes) {
    animations.push(
      animate(
        node,
        [
          previous.get(node) || {
            opacity: 0,
            transform: reduced
              ? 'none'
              : kind === 'results' || kind === 'shelf'
                ? 'none'
                : `translateX(${kind === 'back' ? -24 : 24}px)`,
          },
          { opacity: 1, transform: 'none' },
        ],
        duration,
        contentAnimations,
        curve,
      ),
    );
  }
  void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
    if (active?.version === version) {
      active = null;
      delete document.documentElement.dataset.contentMotion;
    }
  });
  return true;
}

/** FLIP positions and artwork only. Text is never scaled into a different layout. */
export function transitionLayout(update: () => void) {
  stopContentMotion();
  const grid = document.querySelector<HTMLElement>('.movie-grid');
  if (!grid || !spatialMotionAllowed()) {
    stopLayoutMotion();
    flushSync(update);
    if (grid && input === 'pointer')
      animate(grid, [{ opacity: 0.65 }, { opacity: 1 }], 120, layoutAnimations);
    return;
  }
  const snapshots = [...grid.querySelectorAll<HTMLElement>('.movie-card[data-movie-id]')]
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
  stopLayoutMotion();
  const version = layoutVersion;
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
  layoutGrid = grid;
  const animations: Animation[] = [];
  const visible = (rect: DOMRect) => rect.bottom > 0 && rect.top < innerHeight;
  for (const { card, poster, before, artwork, after, targetArtwork } of targets) {
    // Long trips into/out of the viewport cause overlapping rows and flying controls.
    // Preserve spatial continuity only for films visible in both arrangements.
    if (!visible(before) || !visible(after)) {
      if (visible(after))
        animations.push(
          animate(card, [{ opacity: 0.65 }, { opacity: 1 }], 120, layoutAnimations, curve),
        );
      continue;
    }
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
    if (version === layoutVersion) {
      delete grid.dataset.layoutAnimating;
      layoutGrid = null;
    }
  });
}
