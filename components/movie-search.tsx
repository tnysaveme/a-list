'use client';
import { ArrowUpRight, Check, LoaderCircle, Search, X } from 'lucide-react';
import type { useFilmSearch } from '../hooks/use-film-search';
import type { Movie } from '../lib/model';
import { searchReleaseSummary } from '../lib/search-results';
import { FilmPoster } from './film-poster';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
export function MovieSearch({
  search,
  searchResults,
  savedIds,
  onSelect,
}: {
  search: ReturnType<typeof useFilmSearch>;
  searchResults: Movie[];
  savedIds: Set<string>;
  onSelect: (movie: Movie) => void;
}) {
  const { query, searchBusy, searchError, searchRef, changeQuery, closeSearch } = search;
  return (
    <>
      <div className="search-field">
        <Search size={20} />
        <input
          ref={searchRef}
          value={query}
          placeholder="Which film is on your mind?"
          aria-label="Search movie titles"
          autoComplete="off"
          onChange={(e) => changeQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              document.querySelector<HTMLButtonElement>('[data-search-result]')?.focus();
            }
          }}
        />
        <button className="icon-button" aria-label="Close search" onClick={closeSearch}>
          <X size={20} />
        </button>
      </div>
      <div className="search-result-heading">
        <span>{query.trim().length < 2 ? 'Coming to a screen near you' : 'Matching films'}</span>
        {searchBusy && <LoaderCircle className="spin" size={16} />}
      </div>
      <div className="search-results" aria-live="polite">
        {searchError && (
          <p className="search-error">{searchError} Showing matches from the catalogue.</p>
        )}
        {searchResults.map((m, index) => (
          <button
            data-search-result
            key={m.id}
            className="search-result"
            onClick={() => {
              onSelect(m);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const nodes = [
                  ...document.querySelectorAll<HTMLButtonElement>('[data-search-result]'),
                ];
                nodes[
                  (index + (e.key === 'ArrowDown' ? 1 : -1) + nodes.length) % nodes.length
                ]?.focus();
              }
            }}
          >
            <FilmPoster src={m.poster} width={36} height={54} sizes="36px" alt="" />
            <span>
              <strong>{m.title}</strong>
              <small>
                {m.year && `${m.year} · `}
                {searchReleaseSummary(m, today())}
              </small>
            </span>
            {savedIds.has(m.id) ? <Check size={16} /> : <ArrowUpRight size={16} />}
          </button>
        ))}
        {!searchResults.length && !searchBusy && (
          <p className="search-empty">No films found. Try a shorter title or different spelling.</p>
        )}
      </div>
      <div className="search-foot">
        <span>↑ ↓ to explore</span>
        <span>↵ to open</span>
        <span>esc to close</span>
      </div>
    </>
  );
}
