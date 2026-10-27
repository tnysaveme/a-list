'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { DropdownMenu } from 'radix-ui';
import {
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Command,
  LoaderCircle,
  LogOut,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import './app-header.css';
import { Wordmark } from './wordmark';

type AppHeaderProps = {
  ready: boolean;
  onHome: () => void;
  onSearch: () => void;
  onCalendar: () => void;
  onAccount: () => void;
  onAbout: () => void;
};

export function AppHeader({
  ready,
  onHome,
  onSearch,
  onCalendar,
  onAccount,
  onAbout,
}: AppHeaderProps) {
  const [signingOut, setSigningOut] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);

  function openDialog(action: () => void) {
    // Native dialogs restore focus to this persistent control when they close.
    menuTrigger.current?.focus({ preventScroll: true });
    action();
  }

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <button className="wordmark app-header-brand" onClick={onHome} aria-label="A-List home">
          <Wordmark />
        </button>
        <button
          className="app-header-control app-header-search"
          aria-label="Search films"
          aria-keyshortcuts="Meta+K Control+K"
          onClick={onSearch}
        >
          <Search size={18} aria-hidden="true" />
          <span>Find a film</span>
          <kbd aria-hidden="true">
            <Command aria-hidden="true" size={12} />K
          </kbd>
        </button>
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
              <span>Menu</span>
              <ChevronDown size={14} aria-hidden="true" />
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
    </header>
  );
}
