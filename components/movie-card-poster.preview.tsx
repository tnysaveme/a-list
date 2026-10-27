'use client';
/** Development-only state sheet. Not wired into the production route. */
import { MovieCardPoster } from './movie-card-poster';

const states = [
  'default',
  'hover',
  'focus',
  'active',
  'disabled',
  'loading',
  'error',
  'success',
] as const;

export default function MovieCardPosterPreview({
  src,
  loadingSrc,
}: {
  src: string;
  /** An intentionally pending image URL when reviewing loading behavior. */
  loadingSrc: string;
}) {
  return (
    <main style={{ maxWidth: 800, margin: 'auto', padding: 'var(--space-lg)' }}>
      <h1>Movie card · interaction states</h1>
      <div style={{ display: 'grid', gap: 'var(--space-lg)', marginTop: 'var(--space-lg)' }}>
        {states.map((state) => (
          <section
            key={state}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 180px)',
              gap: 'var(--space-md)',
              alignItems: 'center',
            }}
          >
            <h2>{state}</h2>
            <article className="movie-card">
              <MovieCardPoster
                src={state === 'error' ? '' : state === 'loading' ? loadingSrc : src}
                title="One Battle After Another"
                sizes="180px"
                eager
                className={`is-${state}`}
                disabled={state === 'disabled'}
                selecting={state === 'success'}
                selected={state === 'success'}
                onOpen={() => {}}
              />
            </article>
          </section>
        ))}
      </div>
    </main>
  );
}
