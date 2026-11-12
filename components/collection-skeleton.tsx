/** Static placeholders preserve the collection's layout without decorative motion. */
export function CollectionSkeleton({ layout, label }: { layout: string; label: string }) {
  return (
    <div className="collection-skeleton">
      <p className="sr-only" role="status">
        {label}
      </p>
      <div className={`movie-grid ${layout === 'list' ? 'movie-list' : ''}`} aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => (
          <div className="movie-card skeleton-card" key={index}>
            <div className="poster-wrap skeleton-poster" />
            <div className="movie-info">
              <div className="skeleton-line skeleton-title" />
              <div className="skeleton-line skeleton-meta" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
