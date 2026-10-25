'use client';
import Image, { type ImageProps } from 'next/image';
import { optimizablePoster } from '../lib/poster';

const emptyPoster =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="2" height="3"/%3E';

/** Known providers get responsive cached images; other HTTPS posters load directly. */
export function FilmPoster({ src, alt, ...props }: Omit<ImageProps, 'src'> & { src: string }) {
  return (
    <Image {...props} alt={alt} src={src || emptyPoster} unoptimized={!optimizablePoster(src)} />
  );
}
