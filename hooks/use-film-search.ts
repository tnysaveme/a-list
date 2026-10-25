'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { requestApi } from '../lib/client-api';
import type { Movie } from '../lib/model';

export function useFilmSearch() {
  const [searching, setSearching] = useState(false),
    [query, setQuery] = useState(''),
    [results, setResults] = useState<Movie[]>([]),
    [resultsQuery, setResultsQuery] = useState('');
  const [searchBusy, setSearchBusy] = useState(false),
    [searchError, setSearchError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (searching) searchRef.current?.focus();
  }, [searching]);
  useEffect(() => {
    const term = query.trim();
    if (!searching || term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        requestApi<{ movies: Movie[] }>(
          `search?q=${encodeURIComponent(term)}`,
          undefined,
          controller.signal,
        )
          .then((data) => {
            if (!controller.signal.aborted) {
              setResults(data.movies);
              setResultsQuery(term);
            }
          })
          .catch((error) => {
            if (!controller.signal.aborted) setSearchError(error.message);
          })
          .finally(() => {
            if (!controller.signal.aborted) setSearchBusy(false);
          }),
      350,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, searching]);
  const changeQuery = useCallback((value: string) => {
    setQuery(value);
    setSearchError('');
    setSearchBusy(value.trim().length >= 2);
    if (value.trim().length < 2) {
      setResults([]);
      setResultsQuery('');
    }
  }, []);
  const closeSearch = useCallback(() => {
    setSearching(false);
    changeQuery('');
  }, [changeQuery]);
  return {
    searching,
    setSearching,
    query,
    results,
    setResults,
    resultsQuery,
    searchBusy,
    searchError,
    searchRef,
    changeQuery,
    closeSearch,
  };
}
