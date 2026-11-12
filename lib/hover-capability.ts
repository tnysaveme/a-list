const hoverQuery = '(hover: hover) and (pointer: fine)';
let media: MediaQueryList | undefined;
const subscribers = new Set<() => void>();
const query = () => (media ??= window.matchMedia(hoverQuery));
const notify = () => {
  for (const listener of subscribers) listener();
};

/** All mounted posters share one browser listener; the last unmount releases it. */
export function subscribeHover(listener: () => void) {
  if (!subscribers.size) query().addEventListener('change', notify);
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
    if (!subscribers.size) {
      media?.removeEventListener('change', notify);
      media = undefined;
    }
  };
}
export const canHover = () => query().matches;
export const noHover = () => false;
