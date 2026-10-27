'use client';

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

type AppHeaderProps = {
  ready: boolean;
  onHome: () => void;
  catalogue: Movie[];
  savedIds: Set<string>;
  onSelectMovie: (movie: Movie) => void;
  onCalendar: () => void;
  onAccount: () => void;
  onAbout: () => void;
};

export function AppHeader({
  ready,
  onHome,
  catalogue,
  savedIds,
  onSelectMovie,
  onCalendar,
  onAccount,
  onAbout,
}: AppHeaderProps) {
  const [signingOut, setSigningOut] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const search = useFilmSearch();
  const {
    searching,
    setSearching,
    query,
    results,
    resultsQuery,
    searchRef,
    changeQuery,
    closeSearch,
  } = search;
  const resultsId = useId();
  const [activeIndex, setActiveIndex] = useState(-1);
  const currentDay = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const matches = useMemo(
    () =>
      searching
        ? searchMatches(catalogue, resultsQuery === query.trim() ? results : [], query, currentDay)
        : [],
    [catalogue, results, resultsQuery, query, currentDay, searching],
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
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'k' &&
        !document.querySelector('dialog[open]')
      ) {
        event.preventDefault();
        searchRef.current?.focus({ preventScroll: true });
        setSearching(true);
      }
    }
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [searchRef, setSearching]);
  function selectMovie(movie: Movie) {
    closeSearch();
    setActiveIndex(-1);
    onSelectMovie(movie);
  }

  function openDialog(action: () => void) {
    // Native dialogs restore focus to this persistent control when they close.
    menuTrigger.current?.focus({ preventScroll: true });
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
                onFocus={() => setSearching(true)}
                onClick={() => setSearching(true)}
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
                aria-label="Calendar settings"
                disabled={!ready}
                onClick={onCalendar}
              >
                <CalendarDays size={18} aria-hidden="true" />
                <span>Calendar</span>
              </button>
              <DropdownMenu.Root modal={false}>
                <DropdownMenu.Trigger
                  ref={menuTrigger}
                  className="app-header-control app-header-menu-trigger"
                  aria-label="Open A-List menu"
                >
                  <UserRound size={18} aria-hidden="true" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="app-header-menu"
                    align="end"
                    sideOffset={8}
                    collisionPadding={12}
                    aria-label="A-List menu"
                    onCloseAutoFocus={(event) => {
                      if (document.querySelector('dialog[open]')) event.preventDefault();
                    }}
                  >
                    <DropdownMenu.Label className="app-header-menu-label">
                      Settings & help
                    </DropdownMenu.Label>
                    <DropdownMenu.Item
                      className="app-header-menu-item"
                      disabled={!ready}
                      onSelect={() => openDialog(onAccount)}
                    >
                      <UserRound size={17} aria-hidden="true" />
                      Account settings
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="app-header-menu-item"
                      onSelect={() => openDialog(onAbout)}
                    >
                      <CircleHelp size={17} aria-hidden="true" />
                      How A-List works
                    </DropdownMenu.Item>
                    <DropdownMenu.Item className="app-header-menu-item" asChild>
                      <Link href="/privacy">
                        <ShieldCheck size={17} aria-hidden="true" />
                        Privacy & your data
                      </Link>
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator className="app-header-menu-rule" />
                    <form action="/auth/signout" method="post" onSubmit={() => setSigningOut(true)}>
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
                          {signingOut ? 'Signing out…' : 'Sign out'}
                        </button>
                      </DropdownMenu.Item>
                    </form>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </nav>
          </div>
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
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
            <MovieSearch
              search={search}
              searchResults={matches}
              savedIds={savedIds}
              onSelect={selectMovie}
              resultsId={resultsId}
              activeIndex={active}
              onActiveIndex={setActiveIndex}
              currentDay={currentDay}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </header>
  );
}
