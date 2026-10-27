'use client';

/** Development-only review surface; never imported by a production route. */
import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, LogOut, TriangleAlert, X } from 'lucide-react';
import { AppHeader } from './app-header';
import './app-header.preview.css';

export default function AppHeaderPreview() {
  const [ready, setReady] = useState(true);
  const [panel, setPanel] = useState('');
  const [result, setResult] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (panel && !dialog.current?.open) dialog.current?.showModal();
  }, [panel]);
  const states = [
    'default',
    'hover',
    'focus',
    'active',
    'disabled',
    'loading',
    'error',
    'success',
  ] as const;

  return (
    <div
      onSubmitCapture={(event) => {
        const form = event.target as HTMLFormElement;
        if (new URL(form.action).pathname === '/auth/signout') {
          event.preventDefault();
          setResult(
            `${form.method.toUpperCase()} /auth/signout — intercepted by the preview; no session changed.`,
          );
        }
      }}
    >
      <AppHeader
        ready={ready}
        onHome={() => setResult('Discover selected')}
        catalogue={[]}
        savedIds={new Set()}
        onSelectMovie={(movie) => setPanel(movie.title)}
        onCalendar={() => setPanel('Calendar settings')}
        onAccount={() => setPanel('Account settings')}
        onAbout={() => setPanel('How A-List works')}
      />
      <main className="app-header-preview">
        <h1>Navbar preview</h1>
        <p>Production controls, with local callbacks for interaction checks.</p>
        <label className="app-header-preview-ready">
          <input
            type="checkbox"
            checked={ready}
            onChange={(event) => setReady(event.target.checked)}
          />
          Account ready
        </label>
        <p className="app-header-preview-result" role="status">
          {result}
        </p>
        <h2>Control states</h2>
        <div className="app-header-preview-states">
          {states.map((state) => (
            <div key={state}>
              <span>{state}</span>
              <button
                className={`app-header-control ${['hover', 'focus', 'active'].includes(state) ? `is-${state}` : ''}`}
                disabled={state === 'disabled' || state === 'loading'}
                aria-busy={state === 'loading'}
                data-state={['loading', 'error', 'success'].includes(state) ? state : undefined}
              >
                {state === 'loading' ? (
                  <LoaderCircle size={17} className="spin" aria-hidden="true" />
                ) : state === 'error' ? (
                  <TriangleAlert size={17} aria-hidden="true" />
                ) : state === 'success' ? (
                  <Check size={17} aria-hidden="true" />
                ) : (
                  <LogOut size={17} aria-hidden="true" />
                )}
                {state === 'loading'
                  ? 'Signing out…'
                  : state === 'error'
                    ? 'Try again'
                    : state === 'success'
                      ? 'Signed out'
                      : 'Sign out'}
              </button>
            </div>
          ))}
        </div>
      </main>
      <dialog
        ref={dialog}
        className="dialog"
        aria-label={panel || 'Preview dialog'}
        onClose={() => setPanel('')}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="dialog-inner">
          <button
            className="dialog-close icon-button"
            aria-label="Close preview dialog"
            onClick={() => dialog.current?.close()}
          >
            <X size={20} />
          </button>
          <h2>{panel}</h2>
          <p className="app-header-preview-dialog-copy">The header opened the requested control.</p>
          <button className="button subtle" onClick={() => dialog.current?.close()}>
            Done
          </button>
        </div>
      </dialog>
    </div>
  );
}
