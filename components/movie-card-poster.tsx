'use client';
import { useCallback, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { HoverCard } from 'radix-ui';
import { ArrowUpRight, Film } from 'lucide-react';
import { FilmPoster } from './film-poster';
import { canHover, noHover, subscribeHover } from '../lib/hover-capability';

type Props = {
  src: string;
  title: string;
  sizes: string;
  eager?: boolean;
  priority?: boolean;
  selecting?: boolean;
  selected?: boolean;
  disabled?: boolean;
  className?: string;
  onOpen: () => void;
  children?: ReactNode;
  preview?: ReactNode;
};

function PosterPreview({ children, preview }: { children: ReactNode; preview: ReactNode }) {
  const [open, setOpen] = useState(false);
  const dismissed = useRef(false);
  return (
    <HoverCard.Root
      open={open}
      onOpenChange={(next) => setOpen(next && !dismissed.current)}
      openDelay={350}
      closeDelay={100}
    >
      <HoverCard.Trigger
        asChild
        onPointerEnter={() => {
          dismissed.current = false;
        }}
        onFocus={() => {
          dismissed.current = false;
        }}
        onClick={() => {
          dismissed.current = true;
          setOpen(false);
        }}
      >
        {children}
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          className="film-preview"
          side="right"
          align="center"
          sideOffset={16}
          collisionPadding={20}
          aria-hidden="true"
        >
          {preview}
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

/** Cold posters reveal after decoding; cached images are ready before the first paint. */
export function MovieCardPoster({
  src,
  title,
  sizes,
  eager = false,
  priority = false,
  selecting = false,
  selected,
  disabled = false,
  className = '',
  onOpen,
  children,
  preview,
}: Props) {
  const hover = useSyncExternalStore(subscribeHover, canHover, noHover);
  const [ready, setReady] = useState<{ src: string; cached: boolean } | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const onLoad = useCallback(
    () => setReady((previous) => (previous?.src === src ? previous : { src, cached: false })),
    [src],
  );
  const attachImage = useCallback(
    (image: HTMLImageElement | null) => {
      if (image?.complete && image.naturalWidth > 0) setReady({ src, cached: true });
    },
    [src],
  );
  const onError = useCallback(() => setFailedSrc(src), [src]);
  const unavailable = !src || failedSrc === src;
  const loading = !unavailable && ready?.src !== src;
  const artwork = unavailable ? 'error' : loading ? 'loading' : 'ready';

  const poster = (
    <button
      className="poster-button"
      aria-label={`${selecting ? 'Select' : 'View'} ${title}`}
      aria-pressed={selecting ? selected : undefined}
      disabled={disabled}
      onClick={onOpen}
    >
      <span className="card-artwork-placeholder" aria-hidden="true">
        <Film size={24} />
        {unavailable && <span className="card-artwork-note">Artwork unavailable</span>}
      </span>
      {!unavailable && (
        <FilmPoster
          ref={attachImage}
          src={src}
          alt={`${title} poster`}
          width={300}
          height={450}
          sizes={sizes}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          onLoad={onLoad}
          onError={onError}
        />
      )}
      {!selecting && (
        <span className="card-view-cue" aria-hidden="true">
          View Film <ArrowUpRight size={16} />
        </span>
      )}
    </button>
  );

  return (
    <div
      className={`poster-wrap movie-card-poster ${className}`}
      data-artwork={artwork}
      data-artwork-instant={ready?.src === src && ready.cached}
    >
      {hover && preview && !selecting && !disabled ? (
        <PosterPreview preview={preview}>{poster}</PosterPreview>
      ) : (
        poster
      )}
      {children}
    </div>
  );
}
