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
const AccountSettings = dynamic(() => import('../components/account-settings'));
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

export default function AList({
  initialCatalogue,
  initialLibrary,
  initialNavigation = null,
}: {
  initialCatalogue: CataloguePage;
  initialLibrary: LibraryInit | null;
  initialNavigation?: CollectionNavigation | null;
}) {
  const [view, setView] = useState<'discover' | 'library'>(
      initialNavigation?.section || (initialLibrary?.total === 0 ? 'discover' : 'library'),
    ),
    [filter, setFilter] = useState(initialNavigation?.filter || 'all'),
    [sort, setSort] = useState(initialNavigation?.sort || 'release'),
    [layout, setLayout] = useState('grid');
  const [restoring, setRestoring] = useState(!!initialNavigation);
  const sectionQueries = useRef<Record<'library' | 'discover', CollectionQuery>>({
    library: { sort: 'release', filter: 'all' },
    discover: { sort: 'release', filter: 'all' },
  });
  const [searchMembership, setSearchMembership] = useState<
    Record<string, { saved: boolean; at: number }>
  >({});
  const [selection, setSelection] = useState<Set<string>>(new Set()),
    [selecting, setSelecting] = useState(false);
  const [about, setAbout] = useState(false),
    [accountOpen, setAccountOpen] = useState(false);
  const [accountMounted, setAccountMounted] = useState(false);
  const [calendarSetupOffered, setCalendarSetupOffered] = useState(false);
  const [notice, setNotice] = useState<{ message: string; error?: boolean; undo?: Movie[] } | null>(
    null,
  );
  const navigationIntent = useRef(0);
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
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((message: string, error = false, undo?: Movie[]) => {
    setNotice({ message, error, undo });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), undo ? 10000 : 6500);
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
    rememberMovie,
  } = useCatalogue(initialCatalogue, notify);
  const {
    library,
    setLibrary,
    page,
    ready,
    initializing,
    pageBusy,
    busy: libraryBusy,
    pendingIds,
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
      rememberMovie(value);
      const update = (list: Movie[]) => list.map((item) => (item.id === value.id ? value : item));
      setCatalogue(update);
      setLibrary(update);
      setTracked(update);
      if (value.saved) void refreshLibrary();
    },
    [setCatalogue, setLibrary, setTracked, refreshLibrary, rememberMovie],
  );
  const {
    movie,
    setMovie,
    busy: detailBusy,
    error: detailError,
    open: openMovie,
  } = useMovieDetails(applyDetails);
  const busy = libraryBusy || settingsBusy,
    stale = cataloguePage.stale;
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
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [initialLibrary, initialNavigation, initialize, loadCatalogue]);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const refresh = refreshGate(
      revisionRefresh(
        async () => (await getApi('revision', controller.signal)).revision,
        () =>
          view === 'library'
            ? refreshLibrary(controller.signal)
            : refreshCatalogue(controller.signal),
      ),
      { minAgeMs: 55_000 },
    );
    function onRefresh() {
      if (document.visibilityState === 'visible' && navigator.onLine !== false)
        void refresh().catch(() => {});
    }
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
  }, [ready, view, refreshLibrary, refreshCatalogue]);
  const collectionSavedIds = useMemo(
    () => new Set([...library, ...catalogue.filter((m) => m.saved)].map((m) => m.id)),
    [library, catalogue],
  );
  const detailsSavedId = movie?.saved && !collectionSavedIds.has(movie.id) ? movie.id : null;
  const savedIds = useMemo(
    () => (detailsSavedId ? new Set([...collectionSavedIds, detailsSavedId]) : collectionSavedIds),
    [collectionSavedIds, detailsSavedId],
  );
  const libraryById = useMemo(() => new Map(library.map((m) => [m.id, m])), [library]);
  const currentDay = today();
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
    const previous = next === 'library' ? libraryDisplayQuery : catalogueDisplayQuery;
    sectionQueries.current[view] = { sort, filter };
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
    const loaded =
      next === 'discover'
        ? await loadCatalogue(requested, false, undefined, false, next === view && mode === 'push')
        : await loadLibrary(
            0,
            false,
            requested,
            undefined,
            false,
            next === view && mode === 'push',
          );
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
  function changeLayout(next: 'grid' | 'list') {
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
    async (action: 'add' | 'remove', ids: string[]) => {
      const result = await runMutation(action, ids);
      if (!result) return null;
      recordMembership(result.membership);
      setSearchMembership((previous) => ({
        ...previous,
        ...Object.fromEntries(
          Object.entries(result.membership).map(([id, saved]) => [id, { saved, at: Date.now() }]),
        ),
      }));
      const update = (m: Movie) =>
        Object.hasOwn(result.membership, m.id)
          ? { ...m, saved: result.membership[m.id], tracked: result.membership[m.id] }
          : m;
      setCatalogue((list) => list.map(update));
      setMovie((current) => (current ? update(current) : current));
      if (calendar) void loadTracked();
      return result;
    },
    [runMutation, recordMembership, setCatalogue, setMovie, calendar, loadTracked],
  );
  const save = useCallback(
    async (m: Movie) => {
      const firstSave = page.total === 0;
      const result = await mutate('add', [m.id]);
      if (firstSave && result?.changedIds.includes(m.id)) setCalendarSetupOffered(true);
      if (result?.remainingIds.length)
        notify(result.error || 'The film could not be saved. Please try again.', true);
    },
    [mutate, notify, page.total],
  );
  async function remove(ids: string[]) {
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
    const changed = new Set(result.changedIds),
      removed = snapshots.filter((m) => changed.has(m.id));
    if (view === 'library' && changed.size && intent === navigationIntent.current) {
      const first = library.findIndex((film) => changed.has(film.id));
      const next =
        library.slice(Math.max(0, first)).find((film) => !changed.has(film.id)) ||
        library.find((film) => !changed.has(film.id));
      removalFocus.current = { id: next?.id || null, intent };
    }
    setSelection(new Set(result.remainingIds));
    setSelecting(result.remainingIds.length > 0);
    setMovie((current) => (current && changed.has(current.id) ? null : current));
    restoreRemovalFocus();
    if (result.remainingIds.length) {
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
  }
  async function undo() {
    const removed = notice?.undo;
    if (!removed) return;
    setNotice(null);
    const result = await mutate(
      'add',
      removed.map((m) => m.id),
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
    (nextMovie ? calendarRelease(nextMovie, calendarState.includeRumors) : undefined);
  const upcoming = nextMovie && nextDate ? { movie: nextMovie, release: nextDate } : null;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to films
      </a>
      <AppHeader
        ready={ready}
        onHome={() => changeView('discover')}
        catalogue={catalogue}
        savedIds={savedIds}
        membership={searchMembership}
        onSelectMovie={openMovie}
        onCalendar={openCalendar}
        onAccount={() => {
          setAccountMounted(true);
          setAccountOpen(true);
        }}
        onAbout={() => setAbout(true)}
      />
      <main id="main" className="main-content">
        <section className="intro">
          <div>
            <h1>{view === 'library' ? 'Your library' : 'Discover'}</h1>
            <p className="intro-copy">
              {view === 'library'
                ? 'The films you’re looking forward to, all in one place.'
                : 'Find your next watch. We’ll follow the release dates.'}
            </p>
          </div>
          <div className="intro-calendar">
            <span className="territory">US releases</span>
          </div>
        </section>
        <nav className="main-nav" aria-label="Your collection">
          <MovingTabs className="nav-tabs" value={view}>
            <button
              className={view === 'library' ? 'active' : ''}
              aria-pressed={view === 'library'}
              onClick={() => changeView('library')}
            >
              <Bookmark aria-hidden="true" size={16} /> My library{' '}
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
          <span className="save-note">Digital & streaming releases</span>
        </nav>
        <div className="section-content">
          <CalendarSetupPrompt
            active={calendarSetupOffered && ready && page.total > 0}
            onOpen={openCalendar}
          />
          {view === 'library' && upcoming && (
            <aside className="next-up">
              <span className="next-up-date">
                <span>
                  {new Date(`${upcoming.release.date}T12:00:00Z`).toLocaleDateString('en-US', {
                    month: 'short',
                    timeZone: 'UTC',
                  })}
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
                <span className="next-up-track-label">Included in your feed</span>
              </span>
            </aside>
          )}
          <section className="collection" aria-labelledby="collection-heading">
            <div className="section-heading">
              <h2 id="collection-heading" tabIndex={-1}>
                {view === 'library' ? 'Saved films' : 'All films'}
                <span className="heading-count">
                  {view === 'library' ? page.filteredTotal : cataloguePage.filteredTotal}
                </span>
              </h2>
              <span className="collection-status" role="status">
                {(view === 'library' ? libraryLoadReason : catalogueLoadReason) === 'replace'
                  ? 'Updating films…'
                  : ''}
              </span>
            </div>
            <div className="toolbar">
              <MovingTabs className="filter-list" value={filter} label="Filter films">
                {[
                  ['all', 'All films'],
                  ['soon', releaseLabels.soon],
                  ['available', releaseLabels.available],
                  ['unknown', releaseLabels.unknown],
                  ['rumored', releaseLabels.unconfirmed],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    aria-label={label}
                    disabled={view === 'library' && !ready}
                    aria-pressed={filter === id}
                    className={filter === id ? 'active' : ''}
                    onClick={() => changeFilter(id)}
                  >
                    <span className="filter-label">{label}</span>
                  </button>
                ))}
              </MovingTabs>
              <div className="sort-layout">
                <label className="sort-control">
                  <SlidersHorizontal aria-hidden="true" size={14} />
                  <span className="sr-only">Sort films</span>
                  <select
                    aria-label="Sort films"
                    value={sort}
                    disabled={view === 'library' && !ready}
                    onChange={(e) => changeSort(e.target.value)}
                  >
                    <option value="release">Release date</option>
                    <option value="title">Title A–Z</option>
                    <option value="theatrical">Theatrical date</option>
                    {view === 'library' && <option value="added">Recently added</option>}
                  </select>
                  <ChevronDown aria-hidden="true" size={14} />
                </label>
                {view === 'library' && (
                  <button
                    className={`button subtle selection-button ${selecting ? 'selected' : ''}`}
                    aria-label={selecting ? 'Cancel selection' : 'Select films'}
                    title={selecting ? 'Cancel selection' : 'Select films'}
                    disabled={!page.total || busy}
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
                    <span>{selecting ? 'Cancel selection' : 'Select films'}</span>
                  </button>
                )}
                <div className="layout-toggle">
                  <button
                    aria-label="Grid view"
                    aria-pressed={layout === 'grid'}
                    onClick={() => changeLayout('grid')}
                  >
                    <Grid2X2 aria-hidden="true" size={16} />
                  </button>
                  <button
                    aria-label="List view"
                    aria-pressed={layout === 'list'}
                    onClick={() => changeLayout('list')}
                  >
                    <List aria-hidden="true" size={18} />
                  </button>
                </div>
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
                  Try again <RefreshCw aria-hidden="true" size={14} />
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
                  Try again <RefreshCw aria-hidden="true" size={14} />
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
                ((initializing || (pageBusy && library.length === 0)) && view === 'library') ||
                (catalogueBusy && catalogue.length === 0 && view === 'discover') ? (
                  <p className="loading-state">
                    <LoaderCircle aria-hidden="true" size={18} className="spin" /> Opening{' '}
                    {view === 'discover' ? 'Discover…' : 'your library…'}
                  </p>
                ) : movies.length === 0 ? (
                  <div className="empty-state">
                    <Bookmark aria-hidden="true" size={32} />
                    <h3>
                      {filter !== 'all' || page.total || view === 'discover'
                        ? 'Nothing in this chapter yet.'
                        : 'A good film is worth keeping.'}
                    </h3>
                    <p>
                      {filter !== 'all'
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
                        filter !== 'all'
                          ? changeFilter('all')
                          : document.querySelector<HTMLInputElement>('#film-search')?.focus()
                      }
                    >
                      {filter !== 'all'
                        ? 'Show all films'
                        : view === 'library' && !page.total
                          ? 'Find your first film'
                          : 'Find a film'}
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
                    : 'More films'}{' '}
                  <ArrowDownToLine aria-hidden="true" size={16} />
                </button>
                <span>
                  Showing {movies.length} of{' '}
                  {view === 'library' ? page.filteredTotal : cataloguePage.filteredTotal}
                </span>
              </div>
            )}
          </section>
          <aside className="legend">
            <div>
              <span className="legend-title">A note on the dates</span>
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
              How we track <ArrowUpRight aria-hidden="true" size={14} />
            </button>
          </aside>
          <footer className="site-footer">
            <Wordmark className="footer-brand" />
            <p>For the love of a good film.</p>
            <span>
              {catalogueFreshness(cataloguePage)}{' '}
              <span className={`source-dot ${stale ? 'stale' : ''}`} />
            </span>
          </footer>
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
        {notice?.undo && <button onClick={() => undo()}>Undo</button>}
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
        onAfterClose={restoreRemovalFocus}
        onClose={() => setMovie(null)}
      >
        {movie && (
          <MovieDetails
            key={movie.id}
            movie={movie}
            saved={savedIds.has(movie.id)}
            ready={ready}
            busy={busy}
            pending={pendingIds.has(movie.id)}
            loading={detailBusy}
            error={detailError}
            onSave={() => void save(movie)}
            onRemove={() => void remove([movie.id])}
            onClose={() => setMovie(null)}
          />
        )}
      </Dialog>
      <Dialog
        open={calendar}
        label="Your movie calendar"
        className="calendar-dialog"
        onClose={() => setCalendar(false)}
      >
        <CalendarSettings state={calendarState} page={page} ready={ready} busy={busy} />
      </Dialog>
      <Dialog
        open={about}
        label="How A-List tracks releases"
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
