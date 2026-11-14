const query = '(max-width: 39.99rem)';
export const phoneLayout = () => window.matchMedia(query).matches;
export const serverPhoneLayout = () => false;
export function subscribePhoneLayout(listener: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
