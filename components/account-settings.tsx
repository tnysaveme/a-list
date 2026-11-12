'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDownToLine, CalendarDays, LoaderCircle, Trash2, X } from 'lucide-react';
import { AppearanceSetting } from './appearance-setting';
import { Dialog } from './dialog';
import { FeedbackSurface } from './feedback-surface';
import { requestData, RequestError } from '../lib/client-request';
import type { LibraryInit } from '../lib/api-contract';
import './account-settings.css';

export default function AccountSettings({
  open = true,
  onAfterClose,
  onClose,
  onFeedReset,
  onCalendar,
  feedPath,
}: {
  open?: boolean;
  onAfterClose?: () => void;
  onClose: () => void;
  onFeedReset: (path: string) => void;
  onCalendar: () => void;
  feedPath: string;
}) {
  const activeRequest = useRef<AbortController | null>(null);
  const outcomeButton = useRef<HTMLButtonElement>(null);
  const [exporting, setExporting] = useState(false);
  const [uncertain, setUncertain] = useState<'reset' | 'delete' | null>(null);
  useEffect(() => () => activeRequest.current?.abort(), []);
  useEffect(() => {
    if (!open && exporting) activeRequest.current?.abort();
  }, [open, exporting]);
  function close() {
    if (exporting) activeRequest.current?.abort();
    onClose();
  }
  const confirmationInput = useRef<HTMLInputElement>(null),
    resetButton = useRef<HTMLButtonElement>(null),
    deleteButton = useRef<HTMLButtonElement>(null),
    calendarButton = useRef<HTMLButtonElement>(null);
  const [confirm, setConfirm] = useState<'reset' | 'delete' | null>(null),
    [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [reset, setReset] = useState(false);
  useEffect(() => {
    if (uncertain && !busy) outcomeButton.current?.focus();
  }, [uncertain, busy]);
  useEffect(() => {
    if (confirm) confirmationInput.current?.focus();
  }, [confirm]);
  useEffect(() => {
    if (reset) calendarButton.current?.focus();
  }, [reset]);
  function choose(value: 'reset' | 'delete' | null) {
    if (!value) (confirm === 'reset' ? resetButton : deleteButton).current?.focus();
    setConfirm(value);
    setTyped('');
    setError('');
    setMessage('');
  }
  async function download() {
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setExporting(true);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const blob = await requestData<Blob>('/api/account/export', {
        blob: true,
        signal: controller.signal,
        redirectUnauthorized: true,
      });
      controller.signal.throwIfAborted();
      const url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = `a-list-library-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Your library export has been downloaded.');
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
      setExporting(false);
      setBusy(false);
    }
  }
  function completeReset(path: string) {
    onFeedReset(path);
    setReset(true);
    setConfirm(null);
    setUncertain(null);
    setTyped('');
    setError('');
    setMessage(
      'Your old calendar link no longer works. Remove the old subscription from your calendar app, then subscribe again with the new link.',
    );
  }
  async function checkOutcome() {
    if (!uncertain || busy || activeRequest.current) return;
    const action = uncertain;
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(true);
    try {
      const data = await requestData<LibraryInit>('/api/init', {
        body: {},
        readOnly: true,
        signal: controller.signal,
      });
      if (action === 'reset' && data.feedPath !== feedPath) completeReset(data.feedPath);
      else
        setError(
          action === 'reset'
            ? 'Your link has not changed yet. The original request may still finish. Check again before attempting another reset.'
            : 'Your account is still available. The original request may still finish. Check again before attempting deletion.',
        );
    } catch (e) {
      if (controller.signal.aborted) return;
      if (action === 'delete' && e instanceof RequestError && e.status === 401)
        window.location.replace('/login');
      else setError('The outcome could not be checked. Check your connection, then check again.');
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
      setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      activeRequest.current ||
      busy ||
      uncertain ||
      !confirm ||
      typed !== (confirm === 'reset' ? 'RESET' : 'DELETE')
    )
      return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const data = await requestData<{ feedPath: string }>(
        `/api/account/${confirm === 'reset' ? 'reset-calendar' : 'delete'}`,
        { body: { confirmation: typed }, signal: controller.signal, redirectUnauthorized: true },
      );
      if (confirm === 'delete') {
        window.location.replace('/login?deleted=1');
        return;
      }
      completeReset(data.feedPath);
    } catch (e) {
      if (controller.signal.aborted) return;
      if (e instanceof RequestError && e.uncertain) {
        setUncertain(confirm);
        setError(
          'This change could not be confirmed. It may still complete. Check the outcome before trying again.',
        );
      } else setError((e as Error).message);
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      className="account-dialog"
      labelledBy="account-title"
      busy={busy && !exporting}
      onClose={close}
      onAfterClose={onAfterClose}
    >
      <>
        <button
          className="dialog-close icon-button"
          aria-label="Close account settings"
          disabled={busy && !exporting}
          onClick={close}
        >
          <X aria-hidden="true" size={20} />
        </button>
        <h2 id="account-title">Your Account</h2>
        <p className="account-intro">A few simple controls for your collection and calendar.</p>
        <AppearanceSetting />
        <section className="account-section">
          <h3>Your Library, to Keep.</h3>
          <p>
            Download your saved films, including films waiting for a date, and your calendar
            preference as a JSON file. Your secret calendar link is excluded.
          </p>
          <button
            className="button subtle"
            onClick={download}
            disabled={busy && !exporting}
            aria-disabled={busy}
            aria-busy={exporting}
          >
            {exporting ? (
              <LoaderCircle aria-hidden="true" size={16} className="spin" />
            ) : (
              <ArrowDownToLine aria-hidden="true" size={16} />
            )}
            {exporting ? 'Exporting…' : 'Export Library'}
          </button>
        </section>
        <section className="account-section">
          <h3>A Fresh Calendar Link.</h3>
          <p>
            Anyone with your calendar link can read its events. Reset it if it has been shared
            accidentally.
          </p>
          <button
            ref={resetButton}
            className="button subtle"
            onClick={() => choose('reset')}
            disabled={busy || !!uncertain}
          >
            <CalendarDays aria-hidden="true" size={16} />
            Reset Calendar Link
          </button>
        </section>
        <section className="account-section">
          <h3>Close Your Account.</h3>
          <p>
            Delete your sign-in account, saved films and calendar settings. Your shared movie
            catalogue stays available to your friends.
          </p>
          <button
            ref={deleteButton}
            className="button subtle account-danger"
            onClick={() => choose('delete')}
            disabled={busy || !!uncertain}
          >
            <Trash2 aria-hidden="true" size={16} />
            Delete Account
          </button>
        </section>
        <FeedbackSurface open={!!confirm} className="account-confirm-presence">
          <form className="account-confirm" onSubmit={submit}>
            <h3>
              {confirm === 'reset'
                ? 'Reset Your Calendar Link?'
                : 'Delete Your Account Permanently?'}
            </h3>
            <p>
              {confirm === 'reset'
                ? 'The old link will stop working immediately. Remove the old subscription in your calendar app, then subscribe again. Your saved films stay in your library.'
                : 'This permanently removes your account and library and signs you out on all devices. It cannot be undone. Export your library first if you want a copy. Remove the old subscription or downloaded events from your calendar app yourself.'}
            </p>
            <label htmlFor="account-confirmation">
              Type {confirm === 'reset' ? 'RESET' : 'DELETE'} to confirm
            </label>
            <input
              ref={confirmationInput}
              id="account-confirmation"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              maxLength={6}
              disabled={busy}
            />
            <div className="account-actions">
              <button
                className={`button primary ${confirm === 'delete' ? 'account-danger-action' : ''}`}
                aria-busy={busy && !exporting}
                disabled={
                  busy || !!uncertain || typed !== (confirm === 'reset' ? 'RESET' : 'DELETE')
                }
              >
                {busy ? <LoaderCircle aria-hidden="true" size={16} className="spin" /> : null}
                {confirm === 'reset' ? 'Reset Link' : 'Delete Account Permanently'}
              </button>
              <button
                type="button"
                className="button subtle"
                disabled={busy}
                onClick={() => choose(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </FeedbackSurface>
        {error && (
          <p className="account-error" role="alert">
            {error}
          </p>
        )}
        {uncertain && (
          <button
            ref={outcomeButton}
            className="button subtle"
            disabled={busy}
            onClick={() => void checkOutcome()}
          >
            {busy ? 'Checking…' : 'Check Outcome'}
          </button>
        )}
        {message && (
          <p className="account-message" role="status">
            {message}
          </p>
        )}
        {reset && (
          <button
            ref={calendarButton}
            className="button primary"
            disabled={busy}
            onClick={onCalendar}
          >
            Open Calendar Settings
          </button>
        )}
        <form action="/auth/signout" method="post">
          <button className="button subtle account-signout" disabled={busy}>
            Sign Out
          </button>
        </form>
        <p className="account-data-note">
          Your email is used for sign-in. Your library belongs to your account.{' '}
          <a href="/privacy" target="_blank" rel="noreferrer">
            How Your Data Is Used
          </a>
        </p>
      </>
    </Dialog>
  );
}
