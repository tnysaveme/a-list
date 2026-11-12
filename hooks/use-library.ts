'use client';
import { releaseDay } from '../lib/release-day';
import type { MembershipChange } from '../lib/membership-motion';
import { pointerMotionAllowed, transitionContent } from '../lib/content-motion';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type SetStateAction,
} from 'react';
import { getApi, postApi } from '../lib/client-api';
import type { Movie } from '../lib/model';
import type { LibraryPage } from '../lib/pagination';
import { applyLibraryBatch, type BatchResult, type LibraryAction } from '../lib/library-batch';
import { applyWatchedBatch } from '../lib/watched-library';
import { refreshLoadedPages } from '../lib/collection-pages';
import { useCollectionAnchor } from './use-collection-anchor';
import { CollectionViewMemory } from '../lib/collection-view-memory';

import {
  collectionFreshMs,
  initialQuery,
  sameQuery,
  type CollectionError,
} from '../lib/collection-query';
import type { LibraryInit } from '../lib/api-contract';
export type { LibraryInit } from '../lib/api-contract';
const emptyPage: LibraryPage = {
  movies: [],
  total: 0,
  filteredTotal: 0,
  trackedCount: 0,
  knownCount: 0,
  listedEvents: 0,
  rumoredEvents: 0,
  upcoming: null,
  nextOffset: null,
};
function rememberView(
  views: CollectionViewMemory<LibraryPage>,
  query: { sort: string; filter: string },
  page: LibraryPage,
  day: string,
  extent: number,
) {
  views.remember(query, page, day, extent);
  // The full-account count already proves this destination is empty.
  if (page.watchedTotal === 0 && query.filter !== 'watched')
    views.remember(
      { sort: 'added', filter: 'watched' },
      { ...page, movies: [], filteredTotal: 0, nextOffset: null },
      day,
      25,
    );
}
export function useLibrary(
  sort: string,
  filter: string,
  notify: (message: string, error?: boolean) => void,
  initial?: LibraryInit | null,
) {
  const [library, updateLibrary] = useState<Movie[]>(initial?.movies || []),
    [page, setPage] = useState<LibraryPage>(initial || emptyPage);
  const displayed = useRef(library);
  useLayoutEffect(() => {
    displayed.current = library;
  }, [library]);
  const [ready, setReady] = useState(!!initial),
    [initializing, setInitializing] = useState(!initial),
    [pageBusy, setPageBusy] = useState(false),
    [busy, setBusy] = useState(false);
  const [membershipChange, setMembershipChange] = useState<MembershipChange | null>(null);
  const membershipVersion = useRef(0);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [pendingAction, setPendingAction] = useState<LibraryAction | null>(null);
  const [displayQuery, setDisplayQuery] = useState(initialQuery);
  const [loadError, setLoadError] = useState<CollectionError | null>(null);
  const applied = useRef(initialQuery);
  const freshAt = useRef(0);
  const freshDay = useRef(releaseDay());
  const [views] = useState(() => new CollectionViewMemory<LibraryPage>());
  useEffect(() => {
    if (initial) {
      freshAt.current = Date.now();
      rememberView(views, initialQuery, initial, freshDay.current, 25);
    }
  }, [initial, views]);
  const setLibrary = useCallback(
    (value: SetStateAction<Movie[]>) => {
      freshAt.current = 0;
      views.clear();
      updateLibrary(value);
    },
    [views],
  );
  const [loadReason, setLoadReason] = useState<'replace' | 'append' | 'refresh' | null>(null);
  const pageRequest = useRef(0),
    mutating = useRef(false);
  const active = useRef<AbortController | null>(null);
  const extent = useRef(25);
  const personalVersion = useRef(0);
  const mutationIds = useRef<ReadonlySet<string>>(new Set());
  const query = useRef({ sort, filter });
  const loading = useRef(false);
  const watching = useRef(false);
  const captureAnchor = useCollectionAnchor(library);
  useEffect(() => () => active.current?.abort(), []);
  const initialize = useCallback(
    async (signal?: AbortSignal) => {
      const request = ++pageRequest.current;
      try {
        const data = await postApi('init', {}, signal);
        if (signal?.aborted || request !== pageRequest.current) return;
        updateLibrary(data.movies);
        freshAt.current = Date.now();
        views.clear();
        rememberView(views, initialQuery, data, releaseDay(), 25);
        setPage(data);
        setReady(true);
        return data;
      } catch (error) {
        if (!signal?.aborted) notify((error as Error).message, true);
      } finally {
        if (!signal?.aborted) setInitializing(false);
      }
    },
    [notify, views],
  );
  const loadLibrary = useCallback(
    async (
      offset = 0,
      append = false,
      options = { sort, filter },
      parent?: AbortSignal,
      refresh = false,
      animate = false,
    ) => {
      // A background event must not interrupt an explicit filter or pagination request.
      if (parent?.aborted) return false;
      if (watching.current) return false;
      if (refresh && (loading.current || mutating.current)) return false;
      if (
        !refresh &&
        !append &&
        sameQuery(applied.current, options) &&
        Date.now() - freshAt.current < collectionFreshMs &&
        freshDay.current === releaseDay()
      ) {
        // Cancelling a pending switch back to the displayed view needs no request.
        active.current?.abort();
        pageRequest.current++;
        loading.current = false;
        query.current = options;
        setPageBusy(false);
        setLoadReason(null);
        setLoadError(null);
        return true;
      }
      const cached = !refresh && !append ? views.read(options, releaseDay()) : null;
      if (cached) {
        active.current?.abort();
        pageRequest.current++;
        loading.current = false;
        query.current = options;
        setLoadError(null);
        setPageBusy(false);
        setLoadReason(null);
        const shelf = (options.filter === 'watched') !== (applied.current.filter === 'watched');
        const commit = () => {
          updateLibrary(cached.value.movies);
          setPage(cached.value);
          extent.current = cached.extent;
          applied.current = options;
          freshAt.current = cached.at;
          freshDay.current = cached.day;
          setDisplayQuery(options);
        };
        if (animate) return transitionContent(commit, shelf ? 'shelf' : 'results');
        commit();
        return true;
      }
      if (!refresh) query.current = options;
      active.current?.abort();
      const requestedDay = releaseDay();
      const controller = new AbortController();
      active.current = controller;
      const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
      const request = ++pageRequest.current;
      const shelf = (options.filter === 'watched') !== (applied.current.filter === 'watched');
      if (refresh) views.clear();
      loading.current = true;
      setLoadError(null);
      setPageBusy(true);
      setLoadReason(refresh ? 'refresh' : append ? 'append' : 'replace');
      try {
        const read = (at: number) =>
          getApi(`library?sort=${options.sort}&filter=${options.filter}&offset=${at}`, signal);
        let data: LibraryPage;
        let reloadRange = false;
        for (let attempt = 0; ; attempt++) {
          const version = personalVersion.current;
          data =
            refresh || reloadRange
              ? await refreshLoadedPages(
                  read,
                  reloadRange ? Math.max(extent.current, offset + 25) : extent.current,
                )
              : await read(offset);
          if (signal.aborted || request !== pageRequest.current) return false;
          if (version === personalVersion.current) break;
          // Membership changes shift page offsets: rebuild the range instead of skipping a row.
          reloadRange ||= append;
          if (attempt === 2)
            throw new Error('Your library changed while loading. Please try again.');
        }
        if (refresh) captureAnchor();
        const commit = () => {
          if (!refresh) extent.current = append ? Math.max(extent.current, offset + 25) : 25;
          const ids = new Set(displayed.current.map((movie) => movie.id));
          const movies =
            append && !reloadRange
              ? [...displayed.current, ...data.movies.filter((movie) => !ids.has(movie.id))]
              : data.movies;
          displayed.current = movies;
          updateLibrary(movies);
          setPage(data);
          applied.current = options;
          freshAt.current = Date.now();
          freshDay.current = requestedDay;
          setDisplayQuery(options);
          rememberView(
            views,
            options,
            {
              ...data,
              movies,
            },
            requestedDay,
            extent.current,
          );
        };
        if (animate)
          return await transitionContent(
            commit,
            shelf ? 'shelf' : 'results',
            () => !signal.aborted && request === pageRequest.current,
          );
        commit();
        return true;
      } catch (error) {
        if (!signal?.aborted && request === pageRequest.current) {
          query.current = applied.current;
          setLoadError({ query: options, offset, append, refresh });
          notify((error as Error).message, true);
        }
        return false;
      } finally {
        if (request === pageRequest.current) {
          loading.current = false;
          setPageBusy(false);
          setLoadReason(null);
        }
      }
    },
    [sort, filter, notify, captureAnchor, views],
  );
  const refreshLibrary = useCallback(
    (signal?: AbortSignal) => loadLibrary(0, false, query.current, signal, true),
    [loadLibrary],
  );
  const applyMovie = useCallback(
    (value: Movie) => {
      if (mutationIds.current.has(value.id)) return false;
      const wasLoaded = displayed.current.some((movie) => movie.id === value.id);
      personalVersion.current++;
      setLibrary((list) =>
        list.flatMap((movie) => {
          if (movie.id !== value.id) return [movie];
          if (value.saved === false || !!value.watchedAt !== (applied.current.filter === 'watched'))
            return [];
          return [value];
        }),
      );
      if (value.saved || wasLoaded) void refreshLibrary();
      return true;
    },
    [setLibrary, refreshLibrary],
  );
  const mutate = useCallback(
    async (
      action: LibraryAction,
      ids: string[],
      watchedAt?: Record<string, string | null>,
      onCommit?: (result: BatchResult) => void,
    ) => {
      if (mutating.current) return null;
      const pointer = pointerMotionAllowed();
      mutating.current = true;
      mutationIds.current = new Set(ids);
      freshAt.current = 0;
      views.clear();
      query.current = applied.current;
      setBusy(true);
      setPendingIds(new Set(ids));
      setPendingAction(action);
      pageRequest.current++;
      active.current?.abort();
      loading.current = false;
      setPageBusy(false);
      setLoadReason(null);
      try {
        const result = await applyLibraryBatch(action, ids, {
          read: async (chunk) =>
            (await getApi(`library/membership?ids=${chunk.join(',')}`)).membership,
          write: async (action, chunk) => {
            await postApi('library', {
              action,
              ids: chunk,
              ...(watchedAt
                ? {
                    watchedAt: Object.fromEntries(
                      chunk
                        .filter((id) => Object.hasOwn(watchedAt, id))
                        .map((id) => [id, watchedAt[id]]),
                    ),
                  }
                : {}),
            });
          },
        });
        personalVersion.current++;
        const affected = new Set(result.completedIds);
        if (result.completedIds.length)
          setMembershipChange({
            key: ++membershipVersion.current,
            action,
            ids: result.completedIds,
            pointer,
          });
        if (action === 'remove')
          setLibrary((current) => current.filter((movie) => !affected.has(movie.id)));
        // Publish every confirmed surface before releasing the optimistic overlay.
        onCommit?.(result);
        return result;
      } finally {
        mutating.current = false;
        mutationIds.current = new Set();
        setBusy(false);
        setPendingIds(new Set());
        setPendingAction(null);
        // Confirmation is independent of the ancillary list read. Keep loaded pages.
        void refreshLibrary();
      }
    },
    [refreshLibrary, setLibrary, views],
  );
  const mutateWatched = useCallback(
    async (
      watched: boolean,
      ids: string[],
      onCommit?: (result: Awaited<ReturnType<typeof applyWatchedBatch>>) => void,
    ) => {
      if (mutating.current) return null;
      mutating.current = true;
      mutationIds.current = new Set(ids);
      watching.current = true;
      freshAt.current = 0;
      views.clear();
      query.current = applied.current;
      pageRequest.current++;
      active.current?.abort();
      loading.current = false;
      setPageBusy(false);
      setLoadReason(null);
      setBusy(true);
      try {
        const result = await applyWatchedBatch(watched, ids, {
          read: (chunk) => getApi(`library/membership?ids=${chunk.join(',')}`),
          write: async (value, chunk) => {
            const state = await postApi('library', {
              action: value ? 'watch' : 'unwatch',
              ids: chunk,
            });
            return { watched: state.watched || {}, membership: state.membership || {} };
          },
        });
        personalVersion.current++;
        onCommit?.(result);
        return result;
      } finally {
        mutating.current = false;
        mutationIds.current = new Set();
        watching.current = false;
        setBusy(false);
        void refreshLibrary();
      }
    },
    [refreshLibrary, views],
  );
  return {
    library,
    setLibrary,
    applyMovie,
    page,
    ready,
    initializing,
    pageBusy,
    busy,
    pendingIds,
    pendingAction,
    membershipChange,
    displayFilter: displayQuery.filter,
    displayQuery,
    loadError,
    loadReason,
    initialize,
    beginInitialization: () => setInitializing(true),
    loadLibrary,
    refreshLibrary,
    mutate,
    mutateWatched,
  };
}
