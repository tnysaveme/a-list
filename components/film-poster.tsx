'use client';
import { memo, useState, type Ref } from 'react';
import Image, { type ImageProps } from 'next/image';
import { optimizablePoster } from '../lib/poster';

const emptyPoster =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="2" height="3"/%3E';

/** Known providers get responsive cached images; other HTTPS posters load directly. */
export const FilmPoster = memo(function FilmPoster({
  src,
  alt,
  onError,
  ref,
  ...props
}: Omit<ImageProps, 'src'> & { src: string; ref?: Ref<HTMLImageElement> }) {
  const [failed, setFailed] = useState<string | null>(null);
  const image = src && failed !== src ? src : emptyPoster;
  return (
    <Image
      {...props}
      ref={ref}
      alt={alt}
      src={image}
      unoptimized={!optimizablePoster(image)}
      onError={(event) => {
        setFailed(src);
        onError?.(event);
      }}
    />
  );
});
