'use client';
import { useState, type ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { FilmPoster } from './film-poster';

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
};

/** Artwork stays opaque; the placeholder is removed once the real poster loads. */
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
}: Props) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const unavailable = !src || failedSrc === src;
  const loading = !unavailable && loadedSrc !== src;
  const artwork = unavailable ? 'error' : loading ? 'loading' : 'ready';

  return (
    <div className={`poster-wrap movie-card-poster ${className}`} data-artwork={artwork}>
      <button
        className="poster-button"
        aria-label={`${selecting ? 'Select' : 'View'} ${title}`}
        aria-pressed={selecting ? selected : undefined}
        disabled={disabled}
        onClick={onOpen}
      >
        {artwork !== 'ready' && (
          <span className="card-artwork-placeholder" aria-hidden="true">
            <span className="card-artwork-title">{title}</span>
            <span className="card-artwork-note">
              {loading ? 'Loading artwork' : 'Artwork unavailable'}
            </span>
          </span>
        )}
        {!unavailable && (
          <FilmPoster
            src={src}
            alt={`${title} poster`}
            width={300}
            height={450}
            sizes={sizes}
            loading={eager ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : undefined}
            onLoad={() => setLoadedSrc(src)}
            onError={() => setFailedSrc(src)}
          />
        )}
        <span className="card-view-cue" aria-hidden="true">
          <span>{selecting ? (selected ? 'Selected' : 'Select film') : 'View film'}</span>
          <ArrowUpRight aria-hidden="true" size={14} />
        </span>
      </button>
      {children}
    </div>
  );
}
