'use client';
import { useCallback, useEffect, useEffectEvent, useRef, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  ArrowUpRight,
  ArrowRight,
  CalendarDays,
  X,
  ChevronDown,
  SlidersHorizontal,
  Grid2X2,
  List,
  Bookmark,
  Trash2,
  CheckCheck,
  ArrowDownToLine,
  RefreshCw,
  Film,
  LoaderCircle,
} from 'lucide-react';
import { releaseDay } from '../lib/release-day';
import { useReleaseDay } from '../hooks/use-release-day';
import { calendarRelease, type Movie } from '../lib/model';
import type { LibraryInit } from '../lib/api-contract';
import type { CollectionQuery } from '../lib/collection-query';
import { navigationUrl, readNavigation, type CollectionNavigation } from '../lib/navigation-state';
import type { CataloguePage } from '../lib/catalogue-view';
import { useCatalogue } from '../hooks/use-catalogue';
import { useMovieDetails } from '../hooks/use-movie-details';
import { catalogueFreshness } from '../lib/catalogue-fallback';
import { refreshGate } from '../lib/refresh-gate';
import { revisionRefresh } from '../lib/revision-refresh';
import { getApi } from '../lib/client-api';
import { MovingTabs } from '../components/moving-tabs';
import { installMotionInput, transitionContent, transitionLayout } from '../lib/content-motion';
import { CollectionMotion } from '../components/collection-motion';
import { MovieCollection } from '../components/movie-collection';
import { LibraryWeek } from '../components/library-week';
import { CollectionSkeleton } from '../components/collection-skeleton';
import { MovieDetails } from '../components/movie-details';
import { AppHeader } from '../components/app-header';
import { useLibrary } from '../hooks/use-library';
import { useMovieCalendar } from '../hooks/use-movie-calendar';
import { Dialog } from '../components/dialog';
import { Wordmark } from '../components/wordmark';
import { CalendarSettings } from '../components/calendar-settings';
import { CalendarSetupPrompt } from '../components/calendar-setup-prompt';
import { AboutContent } from '../components/about-content';
import { FeedbackSurface } from '../components/feedback-surface';
import { releaseLabels } from '../lib/release-labels';
const filmFilters = [
  ['all', 'All Films'],
  ['soon', releaseLabels.soon],
  ['available', releaseLabels.available],
  ['unknown', releaseLabels.unknown],
  ['rumored', releaseLabels.unconfirmed],
];
const AccountSettings = dynamic(() => import('../components/account-settings'));
const noPendingSaves = new Set<string>();

export default function AList({
  initialCatalogue,
  initialLibrary,
  initialNavigation = null,
  initialReleaseDay = releaseDay(),
}: {
  initialCatalogue: CataloguePage;
  initialLibrary: LibraryInit | null;
  initialNavigation?: CollectionNavigation | null;
  initialReleaseDay?: string;
}) {
  const currentDay = useReleaseDay(initialReleaseDay);
  const refreshedDay = useRef(initialReleaseDay);
  const [view, setView] = useState<'discover' | 'library'>(
      initialNavigation?.section || (initialLibrary?.total === 0 ? 'discover' : 'library'),
    ),
    [filter, setFilter] = useState(initialNavigation?.filter || 'all'),
    [sort, setSort] = useState(initialNavigation?.sort || 'release'),
    [layout, setLayout] = useState('grid');
  const [restoring, setRestoring] = useState(!!initialNavigation);
  const [watchBusy, setWatchBusy] = useState(false);
  const watchMutation = useRef(false);
  const [watchingMovie, setWatchingMovie] = useState<string | null>(null);
  const watchlistQuery = useRef<CollectionQuery>({ sort: 'release', filter: 'all' });
  const sectionQueries = useRef<Record<'library' | 'discover', CollectionQuery>>({
    library: { sort: 'release', filter: 'all' },
    discover: { sort: 'release', filter: 'all' },
  });
  const [searchMembership, setSearchMembership] = useState<
    Record<string, { saved: boolean; at: number; watchedAt?: string | null }>
  >({});
  const [selection, setSelection] = useState<Set<string>>(new Set()),
    [selecting, setSelecting] = useState(false);
  const [about, setAbout] = useState(false),
    [accountOpen, setAccountOpen] = useState(false);
  const [accountMounted, setAccountMounted] = useState(false);
  const [calendarSetupOffered, setCalendarSetupOffered] = useState(false);
  const [saveFailure, setSaveFailure] = useState<{ id: string; message: string } | null>(null);
  const [notice, setNotice] = useState<{ message: string; error?: boolean; undo?: Movie[] } | null>(
    null,
  );
  const navigationIntent = useRef(0);
  const navigationRequest = useRef<AbortController | null>(null);
  useEffect(() => () => navigationRequest.current?.abort(), []);
  const removalFocus = useRef<{ id: string | null; intent: number } | null>(null);
  const restoreRemovalFocus = useCallback(() => {
    requestAnimationFrame(() => {
      const pending = removalFocus.current;
      if (!pending || document.querySelector('dialog[open]')) return;
      removalFocus.current = null;
      if (pending.intent !== navigationIntent.current || document.activeElement !== document.body)
        return;
      const next = pending.id
        ? document.querySelector<HTMLElement>(
            `[data-movie-id="${CSS.escape(pending.id)}"] .poster-button`,
          )
        : null;
      (
        next ||
        document.querySelector<HTMLElement>('.movie-grid .poster-button') ||
        document.getElementById('collection-heading')
      )?.focus({ preventScroll: true });
    });
  }, []);
  useEffect(installMotionInput, []);
  const notify = useCallback((message: string, error = false, undo?: Movie[]) => {
    setNotice({ message, error, undo });
  }, []);
  const {
    catalogue,
    setCatalogue,
    page: cataloguePage,
    busy: catalogueBusy,
    loadReason: catalogueLoadReason,
    displayFilter: catalogueDisplayFilter,
    displayQuery: catalogueDisplayQuery,
    loadError: catalogueError,
    load: loadCatalogue,
    refresh: refreshCatalogue,
    recordMembership,
    recordWatched: recordCatalogueWatched,
    rememberMovie,
  } = useCatalogue(initialCatalogue, notify);
  const {
    library,
    setLibrary,
    applyMovie: applyLibraryMovie,
    page,
    ready,
    initializing,
    pageBusy,
    busy: libraryBusy,
    pendingIds,
    pendingAction,
    membershipChange,
    loadReason: libraryLoadReason,
    displayFilter: libraryDisplayFilter,
    displayQuery: libraryDisplayQuery,
    loadError: libraryError,
    initialize: initializeLibrary,
    beginInitialization,
    loadLibrary,
    refreshLibrary,
    mutate: runMutation,
    mutateWatched: runWatchMutation,
  } = useLibrary(sort, filter, notify, initialLibrary);
  const calendarState = useMovieCalendar(notify, refreshLibrary, initialLibrary);
  const {
    calendar,
    setCalendar,
    settingsBusy,
    setTracked,
    configure: configureCalendar,
    loadTracked,
    openCalendar,
    resetFeed,
  } = calendarState;
  const applyDetails = useCallback(
    (value: Movie) => {
      if (!applyLibraryMovie(value)) return;
      rememberMovie(value);
      if (typeof value.saved === 'boolean') {
        const saved = value.saved;
        setSearchMembership((previous) => ({
          ...previous,
          [value.id]: { saved, watchedAt: value.watchedAt, at: Date.now() },
        }));
      }
      const update = (list: Movie[]) => list.map((item) => (item.id === value.id ? value : item));
      setCatalogue(update);
      setTracked((list) => update(list).filter((movie) => movie.saved && movie.tracked));
    },
    [setCatalogue, setTracked, rememberMovie, applyLibraryMovie],
  );
  const {
    movie,
    setMovie,
    busy: detailBusy,
    error: detailError,
    open: openMovie,
    recordMembership: recordDetailMembership,
    recordWatched: recordDetailWatched,
  } = useMovieDetails(applyDetails);
  const busy = libraryBusy || settingsBusy || watchBusy,
    stale = cataloguePage.stale;
  const noticePaused = !!notice?.undo && busy;
  useEffect(() => {
    if (!notice || noticePaused) return;
    const timer = setTimeout(() => setNotice(null), notice.undo ? 10000 : 6500);
    return () => clearTimeout(timer);
  }, [notice, noticePaused]);
  const watchedShelf = view === 'library' && libraryDisplayFilter === 'watched';
  const changingShelf = view === 'library' && (filter === 'watched') !== watchedShelf && pageBusy;
  const controlsFilter = changingShelf ? libraryDisplayFilter : filter;
  const controlsSort = changingShelf ? libraryDisplayQuery.sort : sort;
  const allWatched =
    view === 'library' &&
    !watchedShelf &&
    controlsFilter === 'all' &&
    page.total > 0 &&
    page.total === page.watchedTotal;
  const initialize = useCallback(
    (signal?: AbortSignal) => {
      const intent = navigationIntent.current;
      return initializeLibrary(signal).then((data) => {
        if (!data || signal?.aborted) return;
        configureCalendar(data);
        if (intent !== 0 || navigationIntent.current !== intent) return;
        if (!data.total) {
          setView('discover');
          writeNavigation({ section: 'discover', sort: 'release', filter: 'all' }, true);
          void loadCatalogue({}, false, signal);
        }
      });
    },
    [initializeLibrary, configureCalendar, loadCatalogue],
  );
  const restoreNavigation = useEffectEvent(async (target: CollectionNavigation) => {
    await navigate(target.section, target, 'restore');
  });
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const restore = () => {
      void restoreNavigation(readNavigation(new URL(window.location.href).searchParams, 'library'));
    };
    window.addEventListener('popstate', restore);
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const saved = localStorage.getItem('a-list-layout');
        if (saved === 'grid' || saved === 'list') setLayout(saved);
      } catch {
        /* Storage is optional. */
      }
    });
    if (initialNavigation) {
      const intent = ++navigationIntent.current;
      void (async () => {
        if (!initialLibrary) await initialize(controller.signal);
        if (!controller.signal.aborted && intent === navigationIntent.current)
          await restoreNavigation(initialNavigation);
      })();
    } else {
      writeNavigation(
        {
          section: initialLibrary?.total === 0 ? 'discover' : 'library',
          sort: 'release',
          filter: 'all',
        },
        true,
      );
      if (!initialLibrary) void initialize(controller.signal);
      else if (!initialLibrary.total) void loadCatalogue({}, false, controller.signal);
    }
    return () => {
      cancelled = true;
      controller.abort();
      window.removeEventListener('popstate', restore);
    };
  }, [initialLibrary, initialNavigation, initialize, loadCatalogue]);
  const refreshActiveCollection = useEffectEvent((signal: AbortSignal) =>
    view === 'library' ? refreshLibrary(signal) : refreshCatalogue(signal),
  );
  useEffect(() => {
    if (!ready) return;
    const dayChanged = refreshedDay.current !== currentDay;
    refreshedDay.current = currentDay;
    const controller = new AbortController();
    const refresh = refreshGate(
      revisionRefresh(
        async () => (await getApi('revision', controller.signal)).revision,
        () => refreshActiveCollection(controller.signal),
      ),
      { minAgeMs: 55_000, freshAt: dayChanged ? 0 : Date.now() },
    );
    function onRefresh() {
      if (document.visibilityState === 'visible' && navigator.onLine !== false)
        void refresh().catch(() => {});
    }
    if (dayChanged) onRefresh();
    const timer = setInterval(onRefresh, 60_000);
    window.addEventListener('focus', onRefresh);
    window.addEventListener('online', onRefresh);
    document.addEventListener('visibilitychange', onRefresh);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener('focus', onRefresh);
      window.removeEventListener('online', onRefresh);
      document.removeEventListener('visibilitychange', onRefresh);
    };
  }, [ready, view, currentDay]);
  const collectionSavedIds = useMemo(
    () => new Set([...library, ...catalogue.filter((m) => m.saved)].map((m) => m.id)),
    [library, catalogue],
  );
  const detailsSavedId = movie?.saved && !collectionSavedIds.has(movie.id) ? movie.id : null;
  const savedIds = useMemo(() => {
    const ids = new Set(collectionSavedIds);
    if (detailsSavedId) ids.add(detailsSavedId);
    // A display-only overlay: never put unconfirmed saves into the catalogue cache.
    if (pendingAction) for (const id of pendingIds) ids.add(id);
    return ids;
  }, [collectionSavedIds, detailsSavedId, pendingAction, pendingIds]);
  const libraryById = useMemo(() => new Map(library.map((m) => [m.id, m])), [library]);
  const movies = view === 'library' ? library : catalogue;
  const movieIds = useMemo(() => movies.map((movie) => movie.id), [movies]);
  function writeNavigation(target: CollectionNavigation, replace = false) {
    const url = navigationUrl(window.location.href, target);
    if (replace) window.history.replaceState(window.history.state, '', url);
    else if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`)
      window.history.pushState(window.history.state, '', url);
  }
  async function navigate(
    next: 'discover' | 'library',
    requested: CollectionQuery,
    mode: 'push' | 'restore' = 'push',
  ) {
    const intent = ++navigationIntent.current;
    navigationRequest.current?.abort();
    const navigation = new AbortController();
    navigationRequest.current = navigation;
    const previous = next === 'library' ? libraryDisplayQuery : catalogueDisplayQuery;
    sectionQueries.current[view] = { sort, filter };
    // Start the request and pending state in the same commit as section navigation.
    // An unloaded destination must show its skeleton from the first frame.
    const loading =
      next === 'discover'
        ? loadCatalogue(
            requested,
            false,
            navigation.signal,
            false,
            next === view && mode === 'push',
          )
        : loadLibrary(
            0,
            false,
            requested,
            navigation.signal,
            false,
            next === view && mode === 'push',
          );
    const switching =
      next === view || mode === 'restore'
        ? Promise.resolve().then(() => {
            if (intent !== navigationIntent.current) return;
            setView(next);
            setFilter(requested.filter);
            setSort(requested.sort);
            setSelection(new Set());
            setSelecting(false);
          })
        : transitionContent(
            () => {
              setView(next);
              setFilter(requested.filter);
              setSort(requested.sort);
              setSelecting(false);
              setSelection(new Set());
            },
            next === 'discover' ? 'forward' : 'back',
            () => intent === navigationIntent.current,
          );
    if (mode === 'push') writeNavigation({ section: next, ...requested });
    await switching;
    if (intent !== navigationIntent.current) return;
    const loaded = await loading;
    if (intent !== navigationIntent.current) return;
    setRestoring(false);
    if (loaded) sectionQueries.current[next] = requested;
    else {
      setFilter(previous.filter);
      setSort(previous.sort);
    }
    writeNavigation({ section: next, ...(loaded ? requested : previous) }, true);
  }
  async function changeView(next: 'discover' | 'library') {
    if (
      next === view &&
      !restoring &&
      !initializing &&
      !(view === 'library' ? pageBusy : catalogueBusy)
    ) {
      ++navigationIntent.current;
      writeNavigation({ section: next, sort, filter });
      if (selecting) {
        setSelecting(false);
        setSelection(new Set());
      }
      return;
    }
    await navigate(next, next === view ? { sort, filter } : sectionQueries.current[next]);
  }
  async function changeQuery(next: CollectionQuery) {
    await navigate(view, next);
  }
  function changeLibrarySection(watched: boolean) {
    if (watchBusy || watched === (filter === 'watched')) return;
    if (watched) {
      watchlistQuery.current = { sort, filter };
      void changeQuery({ sort: 'added', filter: 'watched' });
    } else void changeQuery(watchlistQuery.current);
  }
  async function changeWatched(film: Movie) {
    if (busy || watchMutation.current) return;
    watchMutation.current = true;
    setWatchingMovie(film.id);
    setWatchBusy(true);
    setSaveFailure(null);
    const watched = !film.watchedAt;
    try {
      const result = await runWatchMutation(watched, [film.id], (result) => {
        recordCatalogueWatched(result.watched);
        recordDetailWatched(result.watched);
        const update = (value: Movie): Movie =>
          Object.hasOwn(result.watched, value.id)
            ? {
                ...value,
                saved: true,
                watchedAt: result.watched[value.id],
                tracked: !result.watched[value.id],
              }
            : value;
        setCatalogue((list) => list.map(update));
        setLibrary((list) =>
          list
            .map(update)
            .filter(
              (value) =>
                !Object.hasOwn(result.watched, value.id) ||
                (libraryDisplayFilter === 'watched' ? !!value.watchedAt : !value.watchedAt),
            ),
        );
        setMovie((value) => (value ? update(value) : value));
        setSearchMembership((previous) => ({
          ...previous,
          ...Object.fromEntries(
            Object.entries(result.watched).map(([id, watchedAt]) => [
              id,
              { saved: true, watchedAt, at: Date.now() },
            ]),
          ),
        }));
      });
      if (!result) return;
      if (result.remainingIds.length) {
        setSaveFailure({
          id: film.id,
          message: 'Couldn’t update watched status. Please try again.',
        });
        notify('Couldn’t update watched status. Please try again.', true);
      } else
        notify(watched ? `${film.title} marked as watched.` : `${film.title} moved to To Watch.`);
    } catch {
      setSaveFailure({ id: film.id, message: 'Couldn’t update watched status. Please try again.' });
      notify('Couldn’t update watched status. Please try again.', true);
    } finally {
      watchMutation.current = false;
      setWatchingMovie(null);
      setWatchBusy(false);
      if (calendar) void loadTracked();
    }
  }
  function changeLayout(next: 'grid' | 'list') {
    if (next === layout) return;
    try {
      localStorage.setItem('a-list-layout', next);
    } catch {
      /* Storage is optional. */
    }
    transitionLayout(() => setLayout(next));
  }
  function changeFilter(next: string) {
    void changeQuery({ sort, filter: next });
  }
  function changeSort(next: string) {
    void changeQuery({ sort: next, filter });
  }
  const collectionError = view === 'library' ? libraryError : catalogueError;
  function retryCollection() {
    if (!collectionError) return;
    if (collectionError.refresh) {
      void (view === 'library' ? refreshLibrary() : refreshCatalogue());
    } else if (collectionError.append) {
      void (view === 'library'
        ? loadLibrary(collectionError.offset, true, collectionError.query)
        : loadCatalogue({ ...collectionError.query, offset: collectionError.offset }, true));
    } else void changeQuery(collectionError.query);
  }

  const mutate = useCallback(
    async (action: 'add' | 'remove', ids: string[], watchedAt?: Record<string, string | null>) => {
      return runMutation(action, ids, watchedAt, (result) => {
        recordMembership(result.membership);
        recordDetailMembership(result.membership);
        const restored = watchedAt
          ? Object.fromEntries(
              Object.entries(watchedAt).filter(([id]) => result.changedIds.includes(id)),
            )
          : undefined;
        if (restored) {
          recordCatalogueWatched(restored);
          recordDetailWatched(restored);
        }
        setSearchMembership((previous) => ({
          ...previous,
          ...Object.fromEntries(
            Object.entries(result.membership).map(([id, saved]) => [
              id,
              { saved, at: Date.now(), watchedAt: saved ? restored?.[id] : null },
            ]),
          ),
        }));
        const update = (m: Movie) =>
          Object.hasOwn(result.membership, m.id)
            ? {
                ...m,
                saved: result.membership[m.id],
                watchedAt: result.membership[m.id] ? restored?.[m.id] || m.watchedAt || null : null,
                tracked: result.membership[m.id] && !(restored?.[m.id] || m.watchedAt),
              }
            : m;
        setCatalogue((list) => list.map(update));
        setMovie((current) => (current ? update(current) : current));
        if (calendar) void loadTracked();
      });
    },
    [
      runMutation,
      recordMembership,
      recordDetailMembership,
      recordCatalogueWatched,
      recordDetailWatched,
      setCatalogue,
      setMovie,
      calendar,
      loadTracked,
    ],
  );
  const save = useCallback(
    async (m: Movie) => {
      const firstSave = page.total === 0;
      setSaveFailure(null);
      const result = await mutate('add', [m.id]);
      if (firstSave && result?.changedIds.includes(m.id)) setCalendarSetupOffered(true);
      if (result?.remainingIds.length) {
        const message = result.error || 'The film could not be saved. Please try again.';
        setSaveFailure({ id: m.id, message });
        notify(message, true);
      }
    },
    [mutate, notify, page.total],
  );
  async function remove(ids: string[]) {
    setSaveFailure(null);
    const intent = navigationIntent.current;
    const snapshots = [
      ...new Map(
        [...library, ...catalogue, ...(movie ? [movie] : [])]
          .filter((m) => ids.includes(m.id))
          .map((m) => [m.id, m]),
      ).values(),
    ];
    const result = await mutate('remove', ids);
    if (!result) return;
    const completed = new Set(result.completedIds),
      changed = new Set(result.changedIds),
      removed = snapshots.filter((m) => changed.has(m.id));
    if (view === 'library' && completed.size && intent === navigationIntent.current) {
      const first = library.findIndex((film) => completed.has(film.id));
      const next =
        library.slice(Math.max(0, first)).find((film) => !completed.has(film.id)) ||
        library.find((film) => !completed.has(film.id));
      removalFocus.current = { id: next?.id || null, intent };
    }
    setSelection(new Set(result.remainingIds));
    setSelecting(result.remainingIds.length > 0);
    setMovie((current) => (current && completed.has(current.id) ? null : current));
    restoreRemovalFocus();
    if (result.remainingIds.length) {
      if (movie && result.remainingIds.includes(movie.id))
        setSaveFailure({
          id: movie.id,
          message: result.error || 'The film could not be removed. Please try again.',
        });
      notify(
        `Removed ${removed.length} of ${result.requestedIds.length} films. ${result.remainingIds.length} remain to check or retry. ${result.error || ''}`,
        true,
        removed.length ? removed : undefined,
      );
    } else if (removed.length)
      notify(
        `${removed.length === 1 ? removed[0].title : removed.length + ' films'} removed from your library.`,
        false,
        removed,
      );
    else if (completed.size) {
      const title = snapshots.find((film) => completed.has(film.id))?.title || 'This film';
      notify(
        completed.size === 1
          ? `${title} is no longer in your library.`
          : `${completed.size} films are no longer in your library.`,
      );
    }
  }
  async function undo() {
    const removed = notice?.undo;
    if (!removed || busy || !ready) return;
    setNotice(null);
    const result = await mutate(
      'add',
      removed.map((m) => m.id),
      Object.fromEntries(
        removed.filter((m) => m.watchedAt).map((m) => [m.id, m.watchedAt || null]),
      ),
    );
    if (!result) return;
    if (result.remainingIds.length) {
      const remaining = new Set(result.remainingIds);
      notify(
        `Restored ${result.completedIds.length} of ${result.requestedIds.length} films. Retry the remaining films.`,
        true,
        removed.filter((m) => remaining.has(m.id)),
      );
    } else notify(`${removed.length === 1 ? 'Film' : 'Films'} restored to your library.`);
  }
  const toggle = useCallback((id: string) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const nextMovie = page.upcoming;
  const nextDate =
    page.upcomingRelease ||
    (nextMovie ? calendarRelease(nextMovie, calendarState.includeRumors, currentDay) : undefined);
  const upcoming = nextMovie && nextDate ? { movie: nextMovie, release: nextDate } : null;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to films
      </a>
      <AppHeader
        currentDay={currentDay}
        ready={ready}
        onHome={() => changeView('discover')}
        catalogue={catalogue}
        savedIds={savedIds}
        membership={searchMembership}
        savingIds={pendingAction === 'add' ? pendingIds : noPendingSaves}
        onSelectMovie={openMovie}
        onCalendar={openCalendar}
        onAccount={() => {
          setAccountMounted(true);
          setAccountOpen(true);
        }}
        onAbout={() => setAbout(true)}
      />
      <main id="main" className="main-content">
        <div className="collection-heading">
          <section className="intro">
            <div>
              <h1>{view === 'library' ? 'Your Library' : 'Discover'}</h1>
              <p className="intro-copy">
                {view === 'library'
                  ? 'The films you’ve saved, all in one place.'
                  : 'Find your next watch. We’ll follow the release dates.'}
              </p>
            </div>
          </section>
          <nav className="main-nav" aria-label="Your collection">
            <MovingTabs className="nav-tabs" value={view}>
              <button
                className={view === 'library' ? 'active' : ''}
                aria-pressed={view === 'library'}
                onClick={() => changeView('library')}
              >
                <Bookmark aria-hidden="true" size={16} /> My Library{' '}
                <span className="count">{page.total}</span>
              </button>
              <button
                className={view === 'discover' ? 'active' : ''}
                aria-pressed={view === 'discover'}
                onClick={() => changeView('discover')}
              >
                <Film aria-hidden="true" size={16} /> Discover
              </button>
            </MovingTabs>
          </nav>
        </div>
        <div className="section-content">
          {view === 'library' && (
            <MovingTabs
              className="library-sections"
              value={filter === 'watched' ? 'watched' : 'watchlist'}
              label="Library Sections"
            >
              <button
                className={filter !== 'watched' ? 'active' : ''}
                aria-pressed={filter !== 'watched'}
                aria-busy={changingShelf && filter !== 'watched'}
                disabled={!ready || watchBusy}
                onClick={() => changeLibrarySection(false)}
              >
                To Watch{' '}
                <span className="count" aria-hidden="true">
                  <span>{Math.max(0, page.total - (page.watchedTotal || 0))}</span>
                  {changingShelf && filter !== 'watched' && (
                    <LoaderCircle className="shelf-pending-icon spin" size={14} />
                  )}
                </span>
              </button>
              <button
                className={filter === 'watched' ? 'active' : ''}
                aria-pressed={filter === 'watched'}
                aria-busy={changingShelf && filter === 'watched'}
                disabled={!ready || watchBusy}
                onClick={() => changeLibrarySection(true)}
              >
                Watched{' '}
                <span className="count" aria-hidden="true">
                  <span>{page.watchedTotal || 0}</span>
                  {changingShelf && filter === 'watched' && (
                    <LoaderCircle className="shelf-pending-icon spin" size={14} />
                  )}
                </span>
              </button>
            </MovingTabs>
          )}
          <div className="library-content">
            <CalendarSetupPrompt
              active={calendarSetupOffered && ready && page.trackedCount > 0 && !watchedShelf}
              onOpen={openCalendar}
            />
            {view === 'library' && !watchedShelf && ready && page.trackedCount > 0 && (
              <LibraryWeek entries={page.weekReleases} currentDay={currentDay} onOpen={openMovie}>
                {upcoming && (
                  <aside className="next-up">
                    <span className="next-up-date">
                      <span>
                        {new Date(`${upcoming.release.date}T12:00:00Z`).toLocaleDateString(
                          'en-US',
                          {
                            month: 'short',
                            timeZone: 'UTC',
                          },
                        )}
                      </span>
                      <strong>{upcoming.release.date.slice(-2)}</strong>
                    </span>
                    <div>
                      <p>
                        Next on your horizon
                        {upcoming.release.confidence === 'rumored' && (
                          <span className="next-up-unconfirmed">{releaseLabels.unconfirmed}</span>
                        )}
                      </p>
                      <button className="text-link" onClick={() => openMovie(upcoming.movie)}>
                        {upcoming.movie.title}
                        <ArrowUpRight aria-hidden="true" size={16} />
                      </button>
                    </div>
                    <span className="next-up-type">
                      {upcoming.release.platform ||
                        (upcoming.release.kind === 'Subscription'
                          ? 'Included with a subscription'
                          : upcoming.release.kind === 'PVOD'
                            ? 'Premium rental or purchase'
                            : 'Rent or buy at home')}
                    </span>
                    <span className="next-up-calendar">
                      <CalendarDays size={16} aria-hidden="true" />
                      <span className="next-up-track-label">Included in Your Feed</span>
                    </span>
                  </aside>
                )}
              </LibraryWeek>
            )}
            <section className="collection" aria-labelledby="collection-heading">
              <div className="section-heading">
                <div className="collection-identity">
                  <h2 id="collection-heading" tabIndex={-1}>
                    {view === 'library'
                      ? watchedShelf
                        ? 'Watched Films'
                        : 'Saved Films'
                      : 'All Films'}
                    <span
                      className="heading-count"
                      data-updating={
                        (view === 'library' ? libraryLoadReason : catalogueLoadReason) === 'replace'
                      }
                    >
                      {view === 'library' ? page.filteredTotal : cataloguePage.filteredTotal}
                      {(view === 'library' ? libraryLoadReason : catalogueLoadReason) ===
                        'replace' && (
                        <LoaderCircle
                          className="collection-pending-icon spin"
                          size={14}
                          aria-hidden="true"
                        />
                      )}
                    </span>
                  </h2>
                  {!watchedShelf && <span className="collection-market">US release dates</span>}
                </div>
                <span className="collection-status" role="status">
                  {(view === 'library' ? libraryLoadReason : catalogueLoadReason) === 'replace'
                    ? changingShelf
                      ? filter === 'watched'
                        ? 'Opening Watched…'
                        : 'Opening To Watch…'
                      : 'Updating films…'
                    : ''}
                </span>
                <div className="collection-actions">
                  {view === 'library' && (
                    <button
                      className={`button subtle selection-button ${selecting ? 'selected' : ''}`}
                      aria-label={selecting ? 'Cancel Selection' : 'Select Films'}
                      title={selecting ? 'Cancel Selection' : 'Select Films'}
                      disabled={!movies.length || busy}
                      onClick={() => {
                        setSelecting(!selecting);
                        setSelection(new Set());
                      }}
                    >
                      {selecting ? (
                        <X aria-hidden="true" size={16} />
                      ) : (
                        <CheckCheck aria-hidden="true" size={16} />
                      )}
                      <span>{selecting ? 'Cancel Selection' : 'Select Films'}</span>
                    </button>
                  )}
                  <div className="layout-toggle">
                    <button
                      aria-label="Grid View"
                      aria-pressed={layout === 'grid'}
                      onClick={() => changeLayout('grid')}
                    >
                      <Grid2X2 aria-hidden="true" size={16} />
                    </button>
                    <button
                      aria-label="List View"
                      aria-pressed={layout === 'list'}
                      onClick={() => changeLayout('list')}
                    >
                      <List aria-hidden="true" size={18} />
                    </button>
                  </div>
                </div>
              </div>
              <div className={`toolbar ${watchedShelf ? 'watched-toolbar' : ''}`}>
                {!watchedShelf && (
                  <MovingTabs className="filter-list" value={controlsFilter} label="Filter Films">
                    {filmFilters.map(([id, label]) => (
                      <button
                        key={id}
                        aria-label={label}
                        disabled={watchBusy || (view === 'library' && !ready)}
                        aria-pressed={controlsFilter === id}
                        className={controlsFilter === id ? 'active' : ''}
                        onClick={() => changeFilter(id)}
                      >
                        <span className="filter-label">{label}</span>
                      </button>
                    ))}
                  </MovingTabs>
                )}
                {!watchedShelf && (
                  <label className="sort-control mobile-filter">
                    <span className="sr-only">Filter Films</span>
                    <select
                      aria-label="Filter Films"
                      value={controlsFilter}
                      disabled={watchBusy || (view === 'library' && !ready)}
                      onChange={(event) => changeFilter(event.target.value)}
                    >
                      {filmFilters.map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown aria-hidden="true" size={14} />
                  </label>
                )}
                <div className="sort-layout">
                  <label className="sort-control">
                    <SlidersHorizontal aria-hidden="true" size={14} />
                    <span className="sr-only">Sort Films</span>
                    <select
                      aria-label="Sort Films"
                      value={controlsSort}
                      disabled={watchBusy || (view === 'library' && !ready)}
                      onChange={(e) => changeSort(e.target.value)}
                    >
                      <option value="release">Release Date</option>
                      <option value="title">Title A–Z</option>
                      <option value="theatrical">Theatrical Date</option>
                      {view === 'library' && (
                        <option value="added">
                          {watchedShelf ? 'Recently Watched' : 'Recently Added'}
                        </option>
                      )}
                    </select>
                    <ChevronDown aria-hidden="true" size={14} />
                  </label>
                </div>
              </div>
              {selecting && (
                <label className="select-all">
                  <input
                    type="checkbox"
                    checked={movies.length > 0 && movies.every((m) => selection.has(m.id))}
                    onChange={(e) =>
                      setSelection(e.target.checked ? new Set(movies.map((m) => m.id)) : new Set())
                    }
                  />
                  Select these {movies.length} films <span>{selection.size} selected</span>
                </label>
              )}
              {collectionError && (
                <div className="inline-error">
                  Couldn’t update films.{' '}
                  <button className="text-link" onClick={retryCollection}>
                    Try Again <RefreshCw aria-hidden="true" size={14} />
                  </button>
                </div>
              )}
              {!ready && !initializing && (
                <div className="inline-error" role="alert">
                  Your library couldn’t open.{' '}
                  <button
                    className="text-link"
                    onClick={() => {
                      beginInitialization();
                      void initialize();
                    }}
                  >
                    Try Again <RefreshCw aria-hidden="true" size={14} />
                  </button>
                </div>
              )}
              <div
                className="collection-results"
                aria-busy={restoring || (view === 'library' ? pageBusy : catalogueBusy)}
              >
                <CollectionMotion
                  ids={movieIds}
                  scene={`${view}:${filter}:${sort}`}
                  layout={layout}
                  change={membershipChange}
                >
                  {restoring ||
                  (initializing && view === 'library') ||
                  (catalogueBusy && catalogue.length === 0 && view === 'discover') ? (
                    <CollectionSkeleton
                      layout={layout}
                      label={view === 'discover' ? 'Opening Discover…' : 'Opening your library…'}
                    />
                  ) : movies.length === 0 ? (
                    <div className="empty-state">
                      <h3>
                        {watchedShelf
                          ? 'No Watched Films Yet'
                          : allWatched
                            ? 'No Films to Watch'
                            : controlsFilter !== 'all' || page.total || view === 'discover'
                              ? 'No Films Match This Filter'
                              : 'A good film is worth keeping.'}
                      </h3>
                      <p>
                        {watchedShelf
                          ? 'Mark a saved film as watched to keep it here.'
                          : allWatched
                            ? 'You’ve watched every film in your library. Find something new or revisit Watched.'
                            : controlsFilter !== 'all'
                              ? view === 'discover'
                                ? 'Try another filter to explore more films.'
                                : 'Try another filter to see more of your films.'
                              : view === 'discover'
                                ? 'Search by title to find a film.'
                                : 'Find a film, save it here, and we’ll follow its journey home.'}
                      </p>
                      <button
                        className="button primary"
                        onClick={() =>
                          watchedShelf
                            ? changeLibrarySection(false)
                            : allWatched
                              ? changeLibrarySection(true)
                              : controlsFilter !== 'all'
                                ? changeFilter('all')
                                : document.querySelector<HTMLInputElement>('#film-search')?.focus()
                        }
                      >
                        {watchedShelf
                          ? 'Browse To Watch'
                          : allWatched
                            ? 'Browse Watched'
                            : controlsFilter !== 'all'
                              ? 'Show All Films'
                              : view === 'library' && !page.total
                                ? 'Find Your First Film'
                                : 'Find a Film'}
                        <ArrowRight aria-hidden="true" size={16} />
                      </button>
                    </div>
                  ) : (
                    <MovieCollection
                      movies={movies}
                      layout={layout}
                      filter={view === 'library' ? libraryDisplayFilter : catalogueDisplayFilter}
                      currentDay={currentDay}
                      selecting={selecting}
                      selection={selection}
                      savedIds={savedIds}
                      libraryById={libraryById}
                      pendingIds={pendingIds}
                      pendingAction={pendingAction}
                      busy={busy}
                      ready={ready}
                      onOpen={openMovie}
                      onSave={save}
                      onToggle={toggle}
                    />
                  )}
                </CollectionMotion>
              </div>
              {(view === 'library'
                ? page.nextOffset !== null
                : cataloguePage.nextOffset !== null) && (
                <div className="load-more">
                  <button
                    className="button subtle"
                    disabled={(view === 'library' ? pageBusy : catalogueBusy) || busy}
                    onClick={() =>
                      view === 'library'
                        ? loadLibrary(page.nextOffset!, true)
                        : loadCatalogue({ sort, filter, offset: cataloguePage.nextOffset! }, true)
                    }
                  >
                    {(view === 'library' ? pageBusy : catalogueBusy)
                      ? 'Opening films…'
                      : 'More Films'}{' '}
                    <ArrowDownToLine aria-hidden="true" size={16} />
                  </button>
                  <span>
                    Showing {movies.length} of{' '}
                    {view === 'library' ? page.filteredTotal : cataloguePage.filteredTotal}
                  </span>
                </div>
              )}
            </section>
            {!watchedShelf && (
              <aside className="legend">
                <div>
                  <span className="legend-title">A Note on the Dates</span>
                  <span className="status listed">
                    <span /> Listed by a source
                  </span>
                  <span className="status rumored">
                    <span /> {releaseLabels.unconfirmed}
                  </span>
                  <span className="status unknown">
                    <span /> {releaseLabels.unknown}
                  </span>
                </div>
                <button className="text-link" onClick={() => setAbout(true)}>
                  How A-List Works <ArrowUpRight aria-hidden="true" size={14} />
                </button>
              </aside>
            )}
            <footer className="site-footer">
              <Wordmark className="footer-brand" />
              <p>Cinema at home</p>
              {view === 'discover' && (
                <span>
                  {catalogueFreshness(cataloguePage)}{' '}
                  <span className={`source-dot ${stale ? 'stale' : ''}`} />
                </span>
              )}
            </footer>
          </div>
        </div>
      </main>
      <FeedbackSurface open={selecting && selection.size > 0} className="batch-bar">
        <span>
          <CheckCheck aria-hidden="true" size={18} />
          <strong>{selection.size}</strong> selected
        </span>
        <button
          disabled={busy || !ready}
          aria-busy={libraryBusy}
          onClick={() => remove([...selection])}
        >
          {libraryBusy ? (
            <LoaderCircle aria-hidden="true" size={16} className="spin" />
          ) : (
            <Trash2 aria-hidden="true" size={16} />
          )}
          <span>{libraryBusy ? 'Removing…' : 'Remove'}</span>
        </button>
        <button
          className="icon-button"
          aria-label="Clear selection"
          onClick={() => {
            setSelection(new Set());
            setSelecting(false);
          }}
        >
          <X aria-hidden="true" size={18} />
        </button>
      </FeedbackSurface>
      <FeedbackSurface
        open={!!notice}
        className={`toast ${notice?.error ? 'error' : ''}`}
        role={notice?.error ? 'alert' : 'status'}
      >
        <span>{notice?.message}</span>
        {notice?.undo && (
          <button disabled={busy || !ready} onClick={() => undo()}>
            Undo
          </button>
        )}
        <button
          className="icon-button"
          onClick={() => setNotice(null)}
          aria-label="Dismiss message"
        >
          <X aria-hidden="true" size={16} />
        </button>
      </FeedbackSurface>
      <Dialog
        open={!!movie}
        label={movie ? `${movie.title} details` : 'Film details'}
        className="movie-dialog"
        swipeToClose
        onAfterClose={restoreRemovalFocus}
        onClose={() => setMovie(null)}
      >
        {movie && (
          <MovieDetails
            key={movie.id}
            movie={movie}
            currentDay={currentDay}
            saved={savedIds.has(movie.id)}
            ready={ready}
            busy={busy}
            pending={pendingIds.has(movie.id)}
            saving={pendingAction === 'add' && pendingIds.has(movie.id)}
            watching={watchBusy && watchingMovie === movie.id}
            onWatched={() => void changeWatched(movie)}
            loading={detailBusy}
            error={saveFailure?.id === movie.id ? saveFailure.message : detailError}
            onSave={() => void save(movie)}
            onRemove={() => void remove([movie.id])}
            onClose={() => setMovie(null)}
          />
        )}
      </Dialog>
      <Dialog
        open={calendar}
        label="Your Movie Calendar"
        className="calendar-dialog"
        onClose={() => setCalendar(false)}
      >
        <CalendarSettings
          state={calendarState}
          page={page}
          ready={ready}
          busy={busy}
          currentDay={currentDay}
          onOpenMovie={(film) => {
            setCalendar(false);
            openMovie(film);
          }}
        />
      </Dialog>
      <Dialog
        open={about}
        label="How A-List Works"
        className="about-dialog"
        onClose={() => setAbout(false)}
      >
        <AboutContent onClose={() => setAbout(false)} />
      </Dialog>
      {accountMounted && (
        <AccountSettings
          open={accountOpen}
          onAfterClose={() => setAccountMounted(false)}
          onClose={() => setAccountOpen(false)}
          onFeedReset={resetFeed}
          feedPath={calendarState.feedPath}
          onCalendar={() => {
            setAccountOpen(false);
            openCalendar();
          }}
        />
      )}
    </div>
  );
}
