'use client';
import { useCallback, useState } from 'react';
import Image, { type StaticImageData } from 'next/image';

/** Keep the soft preview visible until Next/Image has decoded the full photograph. */
export function AuthArtwork({ image }: { image: StaticImageData }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const attachImage = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth > 0) setReady(true);
  }, []);
  return (
    <div
      className="auth-artwork"
      data-artwork={failed ? 'error' : ready ? 'ready' : 'loading'}
      style={{ backgroundImage: image.blurDataURL ? `url("${image.blurDataURL}")` : undefined }}
    >
      <Image
        ref={attachImage}
        src={image}
        alt=""
        fill
        sizes="(min-width: 900px) 55vw, 100vw"
        preload
        onLoad={() => {
          setFailed(false);
          setReady(true);
        }}
        onError={() => setFailed(true)}
      />
      <noscript>
        <style>{'.auth-artwork img { opacity: 1 !important; }'}</style>
      </noscript>
    </div>
  );
}
