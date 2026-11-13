'use client';
import { useEffect, useState } from 'react';
import { getApi } from '../lib/client-api';
import type { ReleaseHistoryEntry } from '../lib/release-history';
const dates = (value: string) =>
  new Date(value.length === 10 ? `${value}T12:00:00Z` : value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
export function ReleaseHistory({ movieId, version }: { movieId: string; version: string }) {
  const [open, setOpen] = useState(false),
    [loaded, setLoaded] = useState<{ version: string; entries: ReleaseHistoryEntry[] } | null>(
      null,
    ),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  const entries = loaded?.version === version ? loaded.entries : null;
  useEffect(() => {
    if (!open || entries) return;
    const controller = new AbortController();
    getApi(`movie/${movieId}/history`, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setLoaded({ version, entries: result.entries });
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Date changes could not be loaded.');
      });
    return () => controller.abort();
  }, [open, entries, movieId, retry, version]);
  return (
    <section className="film-history">
      <button
        className="film-control film-history-toggle"
        aria-expanded={open}
        aria-controls={`history-${movieId}`}
        onClick={() => {
          setOpen((value) => !value);
          setError('');
        }}
      >
        Date changes <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div id={`history-${movieId}`} className="film-history-body" aria-live="polite">
          {error ? (
            <p>
              {error}{' '}
              <button
                className="text-link"
                onClick={() => {
                  setError('');
                  setRetry((value) => value + 1);
                }}
              >
                Retry
              </button>
            </p>
          ) : !entries ? (
            <p>Loading date changes…</p>
          ) : !entries.length ? (
            <p>No date changes have been recorded yet.</p>
          ) : (
            <ol>
              {entries.map((entry) => (
                <li key={entry.id}>
                  <strong>
                    {entry.kind === 'Subscription'
                      ? 'Subscription'
                      : entry.kind === 'PVOD'
                        ? 'Premium rental'
                        : 'Digital rental'}
                  </strong>
                  <p>
                    {entry.previous ? dates(entry.previous.date) : 'First listed'}{' '}
                    {entry.current ? <>→ {dates(entry.current.date)}</> : '→ Withdrawn'}
                  </p>
                  <small>
                    {entry.current?.platform ? `${entry.current.platform} · ` : ''}
                    {(entry.current?.source || entry.previous?.source || '').startsWith(
                      'https://',
                    ) ? (
                      <a
                        href={entry.current?.source || entry.previous?.source}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {entry.current?.sourceName || entry.previous?.sourceName}
                      </a>
                    ) : (
                      entry.current?.sourceName || entry.previous?.sourceName
                    )}{' '}
                    · <time dateTime={entry.changedAt}>{dates(entry.changedAt)}</time>
                    {entry.reason === 'confidence_changed'
                      ? ' · Confirmation updated'
                      : entry.reason === 'source_changed'
                        ? ' · Source updated'
                        : entry.reason === 'platform_changed'
                          ? ' · Platform updated'
                          : ''}
                  </small>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
