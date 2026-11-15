import { durationMilliseconds } from './motion-duration';

export type Appearance = 'light' | 'dark' | 'system';

export const APPEARANCE_KEY = 'a-list:appearance:v1';
export const APPEARANCE_EVENT = 'a-list:appearance-change';
export const DARK_MEDIA = '(prefers-color-scheme: dark)';

export function appearanceValue(value: unknown): Appearance {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function currentAppearance(): Appearance {
  return appearanceValue(document.documentElement.dataset.appearance);
}

export function storedAppearance(): Appearance {
  try {
    return appearanceValue(localStorage.getItem(APPEARANCE_KEY));
  } catch {
    return currentAppearance();
  }
}

const paletteAnimations = new Set<Animation>();
const colorProperties = [
  'color',
  'backgroundColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'outlineColor',
  'boxShadow',
  'fill',
  'stroke',
] as const;
type Palette = Record<(typeof colorProperties)[number], string>;

function palette(element: Element, pseudo?: string): Palette {
  const style = getComputedStyle(element, pseudo);
  const paintsText =
    !pseudo &&
    (element instanceof SVGSVGElement ||
      element.matches('input, select, textarea') ||
      [...element.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
      ));
  return Object.fromEntries(
    colorProperties.map((property) => {
      // Structural containers must not propagate animated text color through
      // offscreen descendants. Animate the visible text itself instead.
      if (property === 'color' && !paintsText && pseudo !== '::placeholder') return [property, ''];
      if (
        property.startsWith('border') &&
        !parseFloat(
          style.getPropertyValue(
            property
              .replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
              .replace('color', 'width'),
          ),
        )
      )
        return [property, ''];
      if (property === 'outlineColor' && !parseFloat(style.outlineWidth)) return [property, ''];
      return [property, style[property]];
    }),
  ) as Palette;
}

/** Settle on the committed palette, including when reduced motion changes live. */
export function stopAppearanceTransition() {
  for (const animation of paletteAnimations) animation.cancel();
  paletteAnimations.clear();
  delete document.documentElement.dataset.appearanceTransition;
}

export function applyAppearance(preference: Appearance, animate = false) {
  const root = document.documentElement;
  const theme =
    preference === 'system'
      ? window.matchMedia(DARK_MEDIA).matches
        ? 'dark'
        : 'light'
      : preference;
  const allowed =
    animate &&
    root.dataset.theme !== theme &&
    document.visibilityState === 'visible' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
    typeof root.animate === 'function';
  const previous: { element: Element; pseudo?: string; colors: Palette }[] = [];
  const timing = getComputedStyle(root);
  const duration = durationMilliseconds(timing.getPropertyValue('--dur-medium'), 180);
  const easing = timing.getPropertyValue('--ease-out').trim() || 'cubic-bezier(0.16, 1, 0.3, 1)';
  if (allowed) {
    // Only visible paint participates; poster pixels and all geometry stay untouched.
    // Read presentation colors before cancelling, so reversals never jump to a target.
    for (const element of [root, document.body, ...document.body.querySelectorAll('*')]) {
      if (!(element instanceof HTMLElement || element instanceof SVGSVGElement)) continue;
      const rect = element.getBoundingClientRect();
      if (
        !rect.width ||
        !rect.height ||
        rect.bottom < 0 ||
        rect.top > innerHeight ||
        rect.right < 0 ||
        rect.left > innerWidth
      )
        continue;
      previous.push({ element, colors: palette(element) });
      if (element instanceof HTMLDialogElement && element.open)
        previous.push({ element, pseudo: '::backdrop', colors: palette(element, '::backdrop') });
      if (element.matches('.preference-row input'))
        for (const pseudo of ['::before', '::after'])
          previous.push({ element, pseudo, colors: palette(element, pseudo) });
      if (element.matches('input[placeholder], textarea[placeholder]'))
        previous.push({
          element,
          pseudo: '::placeholder',
          colors: palette(element, '::placeholder'),
        });
    }
  }
  stopAppearanceTransition();
  root.dataset.appearance = preference;
  root.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#161719' : '#ffffff');
  // Prevent a separate hover-color transition from delaying the new palette.
  // Leave opacity, geometry, check strokes and loading motion alone.
  if (typeof CSSTransition !== 'undefined')
    for (const animation of document.getAnimations()) {
      if (
        animation instanceof CSSTransition &&
        /color|^(fill|stroke|box-shadow)$/.test(animation.transitionProperty)
      )
        animation.finish();
    }
  if (previous.length) {
    root.dataset.appearanceTransition = 'colors';
    // Read every target before creating animations to avoid interleaved style flushes.
    const targets = previous.map((entry) => ({
      ...entry,
      next: palette(entry.element, entry.pseudo),
    }));
    const start = document.timeline.currentTime;
    for (const { element, pseudo, colors, next } of targets) {
      const changed = colorProperties.filter((property) => colors[property] !== next[property]);
      if (!changed.length) continue;
      try {
        const animation = element.animate(
          [
            Object.fromEntries(changed.map((property) => [property, colors[property]])),
            Object.fromEntries(changed.map((property) => [property, next[property]])),
          ],
          { duration, easing, pseudoElement: pseudo },
        );
        animation.id = 'appearance-palette';
        if (typeof start === 'number') animation.startTime = start;
        paletteAnimations.add(animation);
        const finish = () => {
          paletteAnimations.delete(animation);
          if (!paletteAnimations.size) delete root.dataset.appearanceTransition;
        };
        void animation.finished.then(finish, finish);
      } catch {
        /* A browser without color/pseudo animation still applies the palette. */
      }
    }
    if (!paletteAnimations.size) delete root.dataset.appearanceTransition;
  }
  // Form state and persistence respond in the same input event.
  window.dispatchEvent(new Event(APPEARANCE_EVENT));
}

export function setAppearance(preference: Appearance) {
  try {
    localStorage.setItem(APPEARANCE_KEY, preference);
  } catch {
    // Restricted storage still allows changing the theme for this page.
  }
  applyAppearance(preference, document.documentElement.dataset.motionInput === 'pointer');
}

export function subscribeAppearance(listener: () => void) {
  window.addEventListener(APPEARANCE_EVENT, listener);
  return () => window.removeEventListener(APPEARANCE_EVENT, listener);
}

// Runs in <head> before paint, independent of React or the account dialog bundle.
// Keep the storage key, allowed values and resolved palette aligned with the helpers above.
export const appearanceScript = `(()=>{let p='system';try{const v=localStorage.getItem('${APPEARANCE_KEY}');if(v==='light'||v==='dark')p=v}catch{}const t=p==='system'?(matchMedia('${DARK_MEDIA}').matches?'dark':'light'):p;document.documentElement.dataset.appearance=p;document.documentElement.dataset.theme=t;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',t==='dark'?'#161719':'#ffffff')})()`;
