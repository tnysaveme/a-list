'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getApi } from '../lib/client-api';
import type { Movie } from '../lib/model';

const normalize = (value: string) => value.trim().toLowerCase();
const freshMs = 60_000;
const maxEntries = 12;

export function useFilmSearch() {
  const [searching, setSearching] = useState(false),
    [query, setQuery] = useState(''),
    [results, setResults] = useState<Movie[]>([]),
    [resultsQuery, setResultsQuery] = useState(''),
    [resultsAt, setResultsAt] = useState(0);
  const [searchBusy, setSearchBusy] = useState(false),
    [searchError, setSearchError] = useState(''),
    [attempt, setAttempt] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  // Bound to this mounted, authenticated header. Never persisted across sessions.
  const cache = useRef(new Map<string, { movies: Movie[]; at: number }>());
  const term = normalize(query);
  useEffect(() => {
    if (searching) searchRef.current?.focus();
  }, [searching]);
  useEffect(() => {
    if (!searching || term.length < 2) return;
    const controller = new AbortController();
    const cached = cache.current.get(term);
    const timer = setTimeout(
      async () => {
        try {
          const started = Date.now();
          const movies =
            cached && Date.now() - cached.at < freshMs
              ? cached.movies
              : (await getApi(`search?q=${encodeURIComponent(term)}`, controller.signal)).movies;
          if (controller.signal.aborted) return;
          cache.current.delete(term);
          cache.current.set(term, {
            movies,
            at: cached && movies === cached.movies ? cached.at : started,
          });
          if (cache.current.size > maxEntries)
            cache.current.delete(cache.current.keys().next().value!);
          setResults(movies);
          setResultsAt(cache.current.get(term)!.at);
          setResultsQuery(term);
        } catch (error) {
          if (!controller.signal.aborted) setSearchError((error as Error).message);
        } finally {
          if (!controller.signal.aborted) setSearchBusy(false);
        }
      },
      cached && Date.now() - cached.at < freshMs ? 0 : 350,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term, searching, attempt]);
  const changeQuery = useCallback((value: string) => {
    setQuery(value);
    setSearchError('');
    const next = normalize(value);
    const cached = cache.current.get(next);
    if (cached && Date.now() - cached.at < freshMs) {
      setResults(cached.movies);
      setResultsAt(cached.at);
      setResultsQuery(next);
      setSearchBusy(false);
    } else {
      setSearchBusy(next.length >= 2);
      if (next.length < 2) {
        setResults([]);
        setResultsQuery('');
      }
    }
  }, []);
  const retrySearch = useCallback(() => {
    cache.current.delete(term);
    setSearchError('');
    setSearchBusy(true);
    setAttempt((current) => current + 1);
  }, [term]);
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
    resultsAt,
    searchBusy,
    searchError,
    searchRef,
    changeQuery,
    closeSearch,
    retrySearch,
  };
}
