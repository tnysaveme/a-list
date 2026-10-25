export const posterPatterns = [
  { protocol: 'https' as const, hostname: 'www.dvdsreleasedates.com', pathname: '/posters/**' },
  { protocol: 'https' as const, hostname: 'images.metahub.space', pathname: '/poster/**' },
  { protocol: 'https' as const, hostname: 'm.media-amazon.com', pathname: '/images/**' },
  { protocol: 'https' as const, hostname: 'image.tmdb.org', pathname: '/t/p/**' },
];

export function optimizablePoster(src: string): boolean {
  try {
    const url = new URL(src);
    return (
      !url.port &&
      !url.username &&
      !url.password &&
      posterPatterns.some(
        (pattern) =>
          url.protocol === `${pattern.protocol}:` &&
          url.hostname === pattern.hostname &&
          url.pathname.startsWith(pattern.pathname.slice(0, -2)),
      )
    );
  } catch {
    return false;
  }
}
