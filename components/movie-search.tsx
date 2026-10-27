'use client';
import { ArrowUpRight, Check, LoaderCircle, X } from 'lucide-react';
import type { useFilmSearch } from '../hooks/use-film-search';
import type { Movie } from '../lib/model';
import { searchReleaseSummary } from '../lib/search-results';
import { FilmPoster } from './film-poster';

export function MovieSearch({
  search,
  searchResults,
  savedIds,
  onSelect,
  resultsId,
  activeIndex,
  onActiveIndex,
  currentDay,
}: {
  search: ReturnType<typeof useFilmSearch>;
  searchResults: Movie[];
  savedIds: Set<string>;
  onSelect: (movie: Movie) => void;
  resultsId: string;
  activeIndex: number;
  onActiveIndex: (index: number) => void;
  currentDay: string;
}) {
  const { query, searchBusy, searchError } = search;
  return (
    <>
      <div className="search-result-heading">
        <span>{query.trim().length < 2 ? 'Explore films' : 'Matching films'}</span>
        <span role="status" className="search-status">
          {searchBusy ? (
            <>
              <LoaderCircle aria-hidden="true" className="spin" size={14} /> Searching…
            </>
          ) : (
            `${searchResults.length} ${searchResults.length === 1 ? 'film' : 'films'}`
          )}
        </span>
        <button
          className="search-mobile-action"
          aria-label={query ? 'Clear search' : 'Close search'}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            if (query) {
              search.changeQuery('');
              onActiveIndex(-1);
              search.searchRef.current?.focus({ preventScroll: true });
            } else search.closeSearch();
          }}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      {searchError && (
        <p className="search-error" role="status">
          {searchError} Showing matches from the catalogue.
        </p>
      )}
      <div
        className="search-results"
        id={resultsId}
        role="listbox"
        aria-label="Film results"
        aria-busy={searchBusy}
      >
        {searchResults.map((movie, index) => (
          <div
            data-search-result
            id={`${resultsId}-${movie.id}`}
            role="option"
            aria-selected={activeIndex === index}
            key={movie.id}
            className="search-result"
            onPointerMove={() => {
              if (activeIndex !== index) onActiveIndex(index);
            }}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => onSelect(movie)}
          >
            <FilmPoster src={movie.poster} width={36} height={54} sizes="40px" alt="" />
            <span>
              <strong>{movie.title}</strong>
              <small>
                {movie.year && `${movie.year} · `}
                {searchReleaseSummary(movie, currentDay)}
              </small>
              {(savedIds.has(movie.id) || movie.saved) && (
                <span className="sr-only">Saved to your library</span>
              )}
            </span>
            {savedIds.has(movie.id) || movie.saved ? (
              <Check aria-hidden="true" size={16} />
            ) : (
              <ArrowUpRight aria-hidden="true" size={16} />
            )}
          </div>
        ))}
      </div>
      {!searchResults.length && (
        <p className="search-empty">
          {searchBusy
            ? 'Searching the catalogue…'
            : query.trim().length < 2
              ? 'Type at least two letters to find a film.'
              : 'No films found. Try a shorter title or different spelling.'}
        </p>
      )}
      <div className="search-foot" aria-hidden="true">
        <span>↑ ↓ Navigate</span>
        <span>↵ Open</span>
        <span>esc Close</span>
      </div>
    </>
  );
}
