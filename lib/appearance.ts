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

export function applyAppearance(preference: Appearance) {
  const theme =
    preference === 'system'
      ? window.matchMedia(DARK_MEDIA).matches
        ? 'dark'
        : 'light'
      : preference;
  document.documentElement.dataset.appearance = preference;
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#161719' : '#ffffff');
}

export function setAppearance(preference: Appearance) {
  try {
    localStorage.setItem(APPEARANCE_KEY, preference);
  } catch {
    // Restricted storage still allows changing the theme for this page.
  }
  applyAppearance(preference);
  window.dispatchEvent(new Event(APPEARANCE_EVENT));
}

export function subscribeAppearance(listener: () => void) {
  window.addEventListener(APPEARANCE_EVENT, listener);
  return () => window.removeEventListener(APPEARANCE_EVENT, listener);
}

// Runs in <head> before paint, independent of React or the account dialog bundle.
// Keep the storage key, allowed values and resolved palette aligned with the helpers above.
export const appearanceScript = `(()=>{let p='system';try{const v=localStorage.getItem('${APPEARANCE_KEY}');if(v==='light'||v==='dark')p=v}catch{}const t=p==='system'?(matchMedia('${DARK_MEDIA}').matches?'dark':'light'):p;document.documentElement.dataset.appearance=p;document.documentElement.dataset.theme=t;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',t==='dark'?'#161719':'#ffffff')})()`;
