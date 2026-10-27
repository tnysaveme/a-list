'use client';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Check,
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
  CircleHelp,
} from 'lucide-react';
import { calendarRelease, type Movie } from '../lib/model';
import { searchMatches } from '../lib/search-results';
import { releaseForView, type CataloguePage } from '../lib/catalogue-view';
import { useCatalogue } from '../hooks/use-catalogue';
import { useMovieDetails } from '../hooks/use-movie-details';
import { catalogueFreshness } from '../lib/catalogue-fallback';
import { refreshGate } from '../lib/refresh-gate';
import { MovieCardPoster } from '../components/movie-card-poster';
import { MovieDetails } from '../components/movie-details';
import { AppHeader } from '../components/app-header';
import { useLibrary } from '../hooks/use-library';
import { useFilmSearch } from '../hooks/use-film-search';
import { useMovieCalendar } from '../hooks/use-movie-calendar';
import { Dialog } from '../components/dialog';
import { Wordmark } from '../components/wordmark';
import { CalendarSettings } from '../components/calendar-settings';
import { MovieSearch } from '../components/movie-search';
import { AboutContent } from '../components/about-content';
const AccountSettings = dynamic(() => import('../components/account-settings'));
const shortDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

export default function AList({ initialCatalogue }: { initialCatalogue: CataloguePage }) {
  const [view, setView] = useState<'discover' | 'library'>('discover'),
    [filter, setFilter] = useState('all'),
    [sort, setSort] = useState('release'),
    [layout, setLayout] = useState('grid');
  const [selection, setSelection] = useState<Set<string>>(new Set()),
    [selecting, setSelecting] = useState(false);
  const [about, setAbout] = useState(false),
    [accountOpen, setAccountOpen] = useState(false);
  const [notice, setNotice] = useState<{ message: string; error?: boolean; undo?: Movie[] } | null>(
    null,
  );
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
    load: loadCatalogue,
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
    initialize: initializeLibrary,
    beginInitialization,
    loadLibrary,
    mutate: runMutation,
  } = useLibrary(sort, filter, notify);
  const searchState = useFilmSearch();
  const { searching, setSearching, query, results, setResults, resultsQuery, closeSearch } =
    searchState;
  const calendarState = useMovieCalendar(notify, loadLibrary);
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
      setResults(update);
      setLibrary(update);
      setTracked(update);
      if (value.saved) void loadLibrary();
    },
    [setCatalogue, setResults, setLibrary, setTracked, loadLibrary, rememberMovie],
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
    (signal?: AbortSignal) =>
      initializeLibrary(signal).then((data) => {
        if (!data || signal?.aborted) return;
        configureCalendar(data);
        if (data.total) setView('library');
      }),
    [initializeLibrary, configureCalendar],
  );
  useEffect(() => {
    const controller = new AbortController();
    void initialize(controller.signal);
    void loadCatalogue({}, false, controller.signal);
    return () => {
      controller.abort();
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [initialize, loadCatalogue]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (!movie && !calendar && !about && !accountOpen) setSearching((s) => !s);
      }
    }
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [movie, calendar, about, accountOpen, setSearching]);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const refresh = refreshGate(async () => {
      const loaded =
        view === 'library'
          ? await loadLibrary(0, false, { sort, filter }, controller.signal)
          : await loadCatalogue({ sort, filter }, false, controller.signal);
      if (!loaded) throw new Error('Refresh did not complete');
    });
    function onRefresh() {
      if (document.visibilityState === 'visible') void refresh().catch(() => {});
    }
    const timer = setInterval(onRefresh, 5 * 60_000);
    window.addEventListener('focus', onRefresh);
    document.addEventListener('visibilitychange', onRefresh);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener('focus', onRefresh);
      document.removeEventListener('visibilitychange', onRefresh);
    };
  }, [ready, view, sort, filter, loadLibrary, loadCatalogue]);
  const savedIds = useMemo(
    () =>
      new Set(
        [
          ...library,
          ...catalogue.filter((m) => m.saved),
          ...results.filter((m) => m.saved),
          ...(movie?.saved ? [movie] : []),
        ].map((m) => m.id),
      ),
    [library, catalogue, results, movie],
  );
  const libraryById = useMemo(() => new Map(library.map((m) => [m.id, m])), [library]);
  const currentDay = today();
  const movies = view === 'library' ? library : catalogue;
  const searchResults = useMemo(
    () => searchMatches(catalogue, resultsQuery === query.trim() ? results : [], query, currentDay),
    [catalogue, results, resultsQuery, query, currentDay],
  );
  function changeView(next: 'discover' | 'library') {
    const nextSort = next === 'discover' && sort === 'added' ? 'release' : sort;
    setView(next);
    setFilter('all');
    setSort(nextSort);
    setSelecting(false);
    setSelection(new Set());
    if (next === 'discover') void loadCatalogue({ sort: nextSort, filter: 'all' });
    else if (ready) void loadLibrary(0, false, { sort: nextSort, filter: 'all' });
  }
  function changeFilter(next: string) {
    setFilter(next);
    setSelection(new Set());
    if (view === 'discover') void loadCatalogue({ sort, filter: next });
    else if (ready) void loadLibrary(0, false, { sort, filter: next });
  }
  function changeSort(next: string) {
    setSort(next);
    setSelection(new Set());
    if (view === 'discover') void loadCatalogue({ sort: next, filter });
    else if (ready) void loadLibrary(0, false, { sort: next, filter });
  }

  async function mutate(action: 'add' | 'remove', ids: string[]) {
    const result = await runMutation(action, ids);
    if (!result) return null;
    recordMembership(result.membership);
    const update = (m: Movie) =>
      Object.hasOwn(result.membership, m.id)
        ? { ...m, saved: result.membership[m.id], tracked: result.membership[m.id] }
        : m;
    setCatalogue((list) => list.map(update));
    setResults((list) => list.map(update));
    setMovie((current) => (current ? update(current) : current));
    if (calendar) await loadTracked();
    return result;
  }
  async function save(m: Movie) {
    const result = await mutate('add', [m.id]);
    if (result?.remainingIds.length)
      notify(result.error || 'The film could not be saved. Please try again.', true);
  }
  async function remove(ids: string[]) {
    const snapshots = [
      ...new Map(
        [...library, ...catalogue, ...results, ...(movie ? [movie] : [])]
          .filter((m) => ids.includes(m.id))
          .map((m) => [m.id, m]),
      ).values(),
    ];
    const result = await mutate('remove', ids);
    if (!result) return;
    const changed = new Set(result.changedIds),
      removed = snapshots.filter((m) => changed.has(m.id));
    setSelection(new Set(result.remainingIds));
    setSelecting(result.remainingIds.length > 0);
    setMovie((current) => (current && changed.has(current.id) ? null : current));
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
  function toggle(id: string) {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
        onSearch={() => setSearching(true)}
        onCalendar={openCalendar}
        onAccount={() => setAccountOpen(true)}
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
          <div className="nav-tabs">
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
          </div>
          <span className="save-note">Digital & streaming releases</span>
        </nav>
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
              <p>Next on your horizon</p>
              <button className="text-link" onClick={() => openMovie(upcoming.movie)}>
                {upcoming.movie.title}
                <ArrowUpRight aria-hidden="true" size={16} />
              </button>
            </div>
            <span className="next-up-type">
              {upcoming.release.platform || 'Rent or buy at home'}
            </span>
            <span className="next-up-calendar">
              <Check size={16} aria-hidden="true" />
              <span className="next-up-track-label">On your calendar</span>
            </span>
          </aside>
        )}
        <section className="collection" aria-labelledby="collection-heading">
          <div className="section-heading">
            <h2 id="collection-heading">
              {view === 'library' ? 'Saved films' : 'All films'}
              <span className="heading-count">
                {view === 'library' ? page.filteredTotal : cataloguePage.filteredTotal}
              </span>
            </h2>
          </div>
          <div className="toolbar">
            <div className="filter-list" aria-label="Filter films">
              {[
                ['all', 'All films', 'All'],
                ['soon', 'Coming soon', 'Soon'],
                ['available', 'Available now', 'Now'],
                ['unknown', 'No date yet', 'No date'],
                ['rumored', 'Reported', 'Reports'],
              ].map(([id, label, shortLabel]) => (
                <button
                  key={id}
                  aria-label={label}
                  aria-pressed={filter === id}
                  className={filter === id ? 'active' : ''}
                  onClick={() => changeFilter(id)}
                >
                  <span className="filter-label">{label}</span>
                  <span className="filter-label-short" aria-hidden="true">
                    {shortLabel}
                  </span>
                </button>
              ))}
            </div>
            <div className="sort-layout">
              <label className="sort-control">
                <SlidersHorizontal aria-hidden="true" size={14} />
                <span className="sr-only">Sort films</span>
                <select
                  aria-label="Sort films"
                  value={sort}
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
                  onClick={() => setLayout('grid')}
                >
                  <Grid2X2 aria-hidden="true" size={16} />
                </button>
                <button
                  aria-label="List view"
                  aria-pressed={layout === 'list'}
                  onClick={() => setLayout('list')}
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
          {((initializing || (pageBusy && library.length === 0)) && view === 'library') ||
          (catalogueBusy && catalogue.length === 0 && view === 'discover') ? (
            <p className="loading-state">
              <LoaderCircle aria-hidden="true" size={18} className="spin" /> Opening your library…
            </p>
          ) : movies.length === 0 ? (
            <div className="empty-state">
              <Bookmark aria-hidden="true" size={32} />
              <h3>
                {page.total || view === 'discover'
                  ? 'Nothing in this chapter yet.'
                  : 'A good film is worth keeping.'}
              </h3>
              <p>
                {page.total
                  ? 'Try another filter to see more of your films.'
                  : 'Find a film, save it here, and we’ll follow its journey home.'}
              </p>
              <button
                className="button primary"
                onClick={() => (page.total ? changeFilter('all') : setSearching(true))}
              >
                {page.total ? 'Show all films' : 'Find your first film'}
                <ArrowRight aria-hidden="true" size={16} />
              </button>
            </div>
          ) : (
            <div className={`movie-grid ${layout === 'list' ? 'movie-list' : ''}`}>
              {movies.map((m, index) => {
                const release = releaseForView(m, filter, currentDay);
                const saved = savedIds.has(m.id);
                const membershipKnown = typeof m.saved === 'boolean' || libraryById.has(m.id);
                return (
                  <article
                    className={`movie-card ${selection.has(m.id) ? 'is-selected' : ''}`}
                    key={m.id}
                  >
                    <MovieCardPoster
                      src={m.poster}
                      title={m.title}
                      sizes={
                        layout === 'list'
                          ? '80px'
                          : '(max-width: 620px) 45vw, (max-width: 1000px) 25vw, 220px'
                      }
                      eager={index < 5}
                      priority={index === 0}
                      selecting={selecting}
                      selected={selection.has(m.id)}
                      onOpen={() => (selecting ? toggle(m.id) : openMovie(m))}
                    >
                      {selecting ? (
                        <label className="poster-checkbox">
                          <input
                            type="checkbox"
                            checked={selection.has(m.id)}
                            onChange={() => toggle(m.id)}
                            aria-label={`Select ${m.title}`}
                          />
                        </label>
                      ) : (
                        <>
                          <button
                            disabled={busy || !ready}
                            className={`save-button ${saved ? 'is-saved' : ''}`}
                            aria-label={
                              !membershipKnown
                                ? `Check saved state for ${m.title}`
                                : saved
                                  ? `${m.title} is saved`
                                  : `Save ${m.title}`
                            }
                            aria-pressed={membershipKnown ? saved : undefined}
                            onClick={() => (saved || !membershipKnown ? openMovie(m) : save(m))}
                          >
                            {!membershipKnown ? (
                              <CircleHelp aria-hidden="true" size={18} />
                            ) : saved ? (
                              <Check aria-hidden="true" size={18} />
                            ) : (
                              <Plus aria-hidden="true" size={20} />
                            )}
                          </button>
                        </>
                      )}
                    </MovieCardPoster>
                    <div className="movie-info">
                      <h3>{m.title}</h3>
                      <div className="movie-meta">
                        {m.year && <span>{m.year}</span>}
                        <span className={`release-line ${release?.confidence || 'unknown'}`}>
                          {release ? (
                            <>
                              <span className="release-confidence" aria-hidden="true" />
                              <span className="release-timing">
                                {release.confidence === 'rumored' ? (
                                  <span className="release-reported">Reported </span>
                                ) : (
                                  <span className="sr-only">
                                    {release.date <= currentDay
                                      ? 'Available since '
                                      : 'Listed for '}
                                  </span>
                                )}
                                <time className="release-date" dateTime={release.date}>
                                  {shortDate(release.date)}
                                  {release.date.slice(0, 4) !== currentDay.slice(0, 4) &&
                                    `, ${release.date.slice(0, 4)}`}
                                </time>
                              </span>
                              <span className="release-kind">
                                {release.platform || release.kind}
                              </span>
                            </>
                          ) : (
                            <span className="unknown-date">Release date TBA</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {(view === 'library' ? page.nextOffset !== null : cataloguePage.nextOffset !== null) && (
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
                {(view === 'library' ? pageBusy : catalogueBusy) ? 'Opening films…' : 'More films'}{' '}
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
              <span /> Reported, not confirmed
            </span>
            <span className="status unknown">
              <span /> Still waiting for news
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
      </main>
      {selecting && selection.size > 0 && (
        <div className="batch-bar">
          <span>
            <CheckCheck aria-hidden="true" size={18} />
            <strong>{selection.size}</strong> selected
          </span>
          <button disabled={busy || !ready} onClick={() => remove([...selection])}>
            <Trash2 aria-hidden="true" size={16} />
            <span>Remove</span>
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
        </div>
      )}
      {notice && (
        <div
          className={`toast ${notice.error ? 'error' : ''}`}
          role={notice.error ? 'alert' : 'status'}
        >
          <span>{notice.message}</span>
          {notice.undo && <button onClick={() => undo()}>Undo</button>}
          <button
            className="icon-button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss message"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>
      )}
      {searching && (
        <Dialog label="Find a film" className="search-dialog" onClose={closeSearch}>
          <MovieSearch
            search={searchState}
            searchResults={searchResults}
            savedIds={savedIds}
            onSelect={(m) => {
              openMovie(m);
              closeSearch();
            }}
          />
        </Dialog>
      )}
      {movie && (
        <Dialog
          label={`${movie.title} details`}
          className="movie-dialog"
          onClose={() => setMovie(null)}
        >
          <MovieDetails
            key={movie.id}
            movie={movie}
            saved={savedIds.has(movie.id)}
            ready={ready}
            busy={busy}
            loading={detailBusy}
            error={detailError}
            onSave={() => void save(movie)}
            onRemove={() => void remove([movie.id])}
            onClose={() => setMovie(null)}
          />
        </Dialog>
      )}
      {calendar && (
        <Dialog
          label="Your movie calendar"
          className="calendar-dialog"
          onClose={() => setCalendar(false)}
        >
          <CalendarSettings state={calendarState} page={page} ready={ready} busy={busy} />
        </Dialog>
      )}
      {about && (
        <Dialog
          label="How A-List tracks releases"
          className="about-dialog"
          onClose={() => setAbout(false)}
        >
          <AboutContent onClose={() => setAbout(false)} />
        </Dialog>
      )}
      {accountOpen && (
        <AccountSettings
          onClose={() => setAccountOpen(false)}
          onFeedReset={resetFeed}
          onCalendar={() => {
            setAccountOpen(false);
            openCalendar();
          }}
        />
      )}
    </div>
  );
}
