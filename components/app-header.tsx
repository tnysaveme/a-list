'use client';
import { releaseDay } from '../lib/release-day';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { DropdownMenu, Popover } from 'radix-ui';
import {
  CalendarDays,
  CircleHelp,
  LoaderCircle,
  LogOut,
  Search,
  X,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import './app-header.css';
import { Wordmark } from './wordmark';
import { useFilmSearch } from '../hooks/use-film-search';
import { searchMatches } from '../lib/search-results';
import type { Movie } from '../lib/model';
import { MovieSearch } from './movie-search';
import { useExitPresence } from '../hooks/use-exit-presence';
import { ExitContent } from './feedback-surface';

const emptyMembership: Record<string, { saved: boolean; at: number }> = {};

type AppHeaderProps = {
  currentDay?: string;
  ready: boolean;
  onHome: () => void;
  catalogue: Movie[];
  savedIds: Set<string>;
  savingIds?: Set<string>;
  membership?: Record<string, { saved: boolean; at: number; watchedAt?: string | null }>;
  onSelectMovie: (movie: Movie) => void;
  onCalendar: () => void;
  onAccount: () => void;
  onAbout: () => void;
};

export function AppHeader({
  currentDay = releaseDay(),
  ready,
  onHome,
  catalogue,
  savedIds,
  savingIds,
  membership = emptyMembership,
  onSelectMovie,
  onCalendar,
  onAccount,
  onAbout,
}: AppHeaderProps) {
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogHandoff, setDialogHandoff] = useState(false);
  const [keyboardInput, setKeyboardInput] = useState(true);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const search = useFilmSearch();
  const {
    searching,
    setSearching,
    query,
    results,
    resultsQuery,
    resultsAt,
    searchRef,
    changeQuery,
    closeSearch,
  } = search;
  const { ref: menuRef, mounted: menuMounted } = useExitPresence<HTMLDivElement>(menuOpen);
  const { ref: searchPanelRef, mounted: searchMounted } =
    useExitPresence<HTMLDivElement>(searching);
  const resultsId = useId();
  useEffect(() => {
    if (!searching) return;
    const panel = searchPanelRef.current;
    const viewport = window.visualViewport;
    if (!panel || !viewport) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const room = viewport.offsetTop + viewport.height - panel.getBoundingClientRect().top - 12;
        panel.style.setProperty('--search-visible-height', `${Math.max(80, room)}px`);
      });
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [searching, searchPanelRef]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const matches = useMemo(
    () =>
      searching
        ? searchMatches(
            catalogue,
            resultsQuery === query.trim().toLowerCase() ? results : [],
            query,
            currentDay,
          ).map((movie) =>
            membership[movie.id] &&
            membership[movie.id].at >= resultsAt &&
            results.some((result) => result.id === movie.id)
              ? {
                  ...movie,
                  saved: membership[movie.id].saved,
                  watchedAt:
                    membership[movie.id].watchedAt === undefined
                      ? movie.watchedAt
                      : membership[movie.id].watchedAt,
                  tracked:
                    membership[movie.id].saved &&
                    !(membership[movie.id].watchedAt === undefined
                      ? movie.watchedAt
                      : membership[movie.id].watchedAt),
                }
              : movie,
          )
        : [],
    [catalogue, results, resultsQuery, resultsAt, query, currentDay, searching, membership],
  );
  const active = activeIndex >= 0 && activeIndex < matches.length ? activeIndex : -1;
  useEffect(() => {
    if (active >= 0)
      document
        .getElementById(`${resultsId}-${matches[active].id}`)
        ?.scrollIntoView({ block: 'nearest' });
  }, [active, matches, resultsId]);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      setKeyboardInput(true);
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'k' &&
        !document.querySelector('dialog[open]')
      ) {
        event.preventDefault();
        searchRef.current?.focus({ preventScroll: true });
        setDialogHandoff(false);
        setSearching(true);
      }
    }
    function pointer() {
      setKeyboardInput(false);
    }
    document.addEventListener('keydown', key, true);
    document.addEventListener('pointerdown', pointer, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('pointerdown', pointer, true);
    };
  }, [searchRef, setSearching]);
  function selectMovie(movie: Movie) {
    // Remove the exiting Radix layer before the native dialog takes Escape handling.
    setDialogHandoff(true);
    if (!keyboardInput) {
      searchRef.current?.blur();
      menuTrigger.current?.focus({ preventScroll: true });
    }
    closeSearch();
    setActiveIndex(-1);
    onSelectMovie(movie);
  }

  function openDialog(action: () => void) {
    // Native dialogs restore focus to this persistent control when they close.
    menuTrigger.current?.focus({ preventScroll: true });
    // A retained Radix layer would capture Escape ahead of the new native modal.
    setDialogHandoff(true);
    setMenuOpen(false);
    action();
  }

  return (
    <header className="app-header">
      <Popover.Root
        open={searching}
        onOpenChange={(open) => {
          if (!open) {
            closeSearch();
            setActiveIndex(-1);
          }
        }}
      >
        <Popover.Anchor asChild>
          <div className="app-header-inner">
            <button className="wordmark app-header-brand" onClick={onHome} aria-label="A-List home">
              <Wordmark />
            </button>
            <div className="app-header-search-field">
              <Search size={18} aria-hidden="true" />
              <input
                ref={searchRef}
                id="film-search"
                type="search"
                role="combobox"
                aria-label="Search films"
                aria-keyshortcuts="Meta+K Control+K"
                aria-expanded={searching}
                aria-controls={searching ? resultsId : undefined}
                aria-autocomplete="list"
                aria-activedescendant={
                  searching && active >= 0 ? `${resultsId}-${matches[active].id}` : undefined
                }
                placeholder="Search"
                autoComplete="off"
                spellCheck={false}
                value={query}
                onFocus={() => {
                  setDialogHandoff(false);
                  setSearching(true);
                }}
                onClick={() => {
                  setDialogHandoff(false);
                  setSearching(true);
                }}
                onChange={(event) => {
                  changeQuery(event.target.value);
                  setActiveIndex(-1);
                  setSearching(true);
                }}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    setSearching(true);
                    setActiveIndex((index) =>
                      matches.length
                        ? index < 0
                          ? event.key === 'ArrowDown'
                            ? 0
                            : matches.length - 1
                          : (index + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) %
                            matches.length
                        : -1,
                    );
                  } else if (
                    event.key === 'Enter' &&
                    searching &&
                    matches[active >= 0 ? active : 0]
                  ) {
                    event.preventDefault();
                    selectMovie(matches[active >= 0 ? active : 0]);
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    closeSearch();
                    setActiveIndex(-1);
                  }
                }}
              />
              <div className="app-header-search-accessory">
                {query || searching ? (
                  <button
                    className="app-header-search-clear"
                    aria-label={query ? 'Clear search' : 'Close search'}
                    onClick={() => {
                      if (query) {
                        changeQuery('');
                        searchRef.current?.focus();
                      } else closeSearch();
                      setActiveIndex(-1);
                    }}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                ) : (
                  <kbd className="app-header-shortcut" aria-hidden="true">
                    ⌘ K
                  </kbd>
                )}
              </div>
            </div>
            <nav className="app-header-actions" aria-label="App controls">
              <button
                className="app-header-control app-header-calendar"
                aria-label="Calendar Settings"
                disabled={!ready}
                onClick={onCalendar}
              >
                <CalendarDays size={18} aria-hidden="true" />
                <span>Calendar</span>
              </button>
              <DropdownMenu.Root
                modal={false}
                open={menuOpen}
                onOpenChange={(open) => {
                  if (open) setDialogHandoff(false);
                  setMenuOpen(open);
                }}
              >
                <DropdownMenu.Trigger
                  ref={menuTrigger}
                  className="app-header-control app-header-menu-trigger"
                  aria-label="Open A-List menu"
                >
                  <UserRound size={18} aria-hidden="true" />
                </DropdownMenu.Trigger>
                {menuMounted && !dialogHandoff && (
                  <DropdownMenu.Portal forceMount>
                    <DropdownMenu.Content
                      forceMount
                      ref={menuRef}
                      data-instant={keyboardInput}
                      inert={!menuOpen}
                      className="app-header-menu"
                      align="end"
                      sideOffset={8}
                      collisionPadding={12}
                      aria-label="A-List menu"
                      onInteractOutside={(event) => {
                        // The trigger owns toggling. A retained closing layer must not
                        // dismiss the same pointer event again after it reopens the menu.
                        if (!menuOpen || menuTrigger.current?.contains(event.target as Node))
                          event.preventDefault();
                      }}
                      onCloseAutoFocus={(event) => {
                        const focused = document.activeElement;
                        if (
                          document.querySelector('dialog[open]') ||
                          (focused instanceof HTMLElement &&
                            focused !== document.body &&
                            focused !== menuTrigger.current &&
                            !focused.closest('[data-radix-menu-content]'))
                        )
                          event.preventDefault();
                      }}
                    >
                      <DropdownMenu.Label className="app-header-menu-label">
                        Settings & Help
                      </DropdownMenu.Label>
                      <DropdownMenu.Item
                        className="app-header-menu-item"
                        disabled={!ready}
                        onSelect={() => openDialog(onAccount)}
                      >
                        <UserRound size={17} aria-hidden="true" />
                        Account Settings
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        className="app-header-menu-item"
                        onSelect={() => openDialog(onAbout)}
                      >
                        <CircleHelp size={17} aria-hidden="true" />
                        How A-List Works
                      </DropdownMenu.Item>
                      <DropdownMenu.Item className="app-header-menu-item" asChild>
                        <Link href="/privacy">
                          <ShieldCheck size={17} aria-hidden="true" />
                          Privacy & Your Data
                        </Link>
                      </DropdownMenu.Item>
                      <DropdownMenu.Separator className="app-header-menu-rule" />
                      <form
                        action="/auth/signout"
                        method="post"
                        onSubmit={() => setSigningOut(true)}
                      >
                        <DropdownMenu.Item
                          asChild
                          disabled={signingOut}
                          onSelect={(event) => event.preventDefault()}
                        >
                          <button
                            type="submit"
                            className="app-header-control app-header-signout"
                            disabled={signingOut}
                            aria-busy={signingOut}
                            data-state={signingOut ? 'loading' : undefined}
                          >
                            {signingOut ? (
                              <LoaderCircle size={17} className="spin" aria-hidden="true" />
                            ) : (
                              <LogOut size={17} aria-hidden="true" />
                            )}
                            {signingOut ? 'Signing out…' : 'Sign Out'}
                          </button>
                        </DropdownMenu.Item>
                      </form>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                )}
              </DropdownMenu.Root>
            </nav>
          </div>
        </Popover.Anchor>
        {searchMounted && (searching || !dialogHandoff) && (
          <Popover.Portal forceMount>
            <Popover.Content
              forceMount
              ref={searchPanelRef}
              data-instant={keyboardInput}
              inert={!searching}
              className="app-search-panel"
              aria-label="Film search"
              sideOffset={10}
              collisionPadding={16}
              align="center"
              onOpenAutoFocus={(event) => event.preventDefault()}
              onCloseAutoFocus={(event) => event.preventDefault()}
              onInteractOutside={(event) => {
                if (searchRef.current?.parentElement?.contains(event.target as Node))
                  event.preventDefault();
              }}
              onEscapeKeyDown={() => {
                closeSearch();
                setActiveIndex(-1);
              }}
            >
              <ExitContent open={searching}>
                <MovieSearch
                  search={search}
                  searchResults={matches}
                  savedIds={savedIds}
                  savingIds={savingIds}
                  onSelect={selectMovie}
                  resultsId={resultsId}
                  activeIndex={active}
                  onActiveIndex={setActiveIndex}
                  currentDay={currentDay}
                />
              </ExitContent>
            </Popover.Content>
          </Popover.Portal>
        )}
      </Popover.Root>
    </header>
  );
}
