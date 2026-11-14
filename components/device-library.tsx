'use client';
import { useEffect, useState } from 'react';
import { clearOfflineLibrary, readOfflineLibrary } from '../public/offline-store.js';

export function DeviceLibrary() {
  const [summary, setSummary] = useState('Checking this device…');
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const update = () => {
      void readOfflineLibrary()
        .then((snapshot) => {
          if (!active) return;
          const ready = !!snapshot?.owner && Array.isArray(snapshot.movies);
          setAvailable(ready);
          setSummary(
            ready
              ? `${snapshot.movies.length} saved films · Last synced ${new Date(snapshot.syncedAt).toLocaleString()}`
              : 'No offline copy is stored yet. Keep A-List open while connected to sync your library.',
          );
        })
        .catch(() => {
          if (active) setSummary('Offline storage is unavailable in this browser.');
        });
    };
    update();
    window.addEventListener('alist-offline-synced', update);
    window.addEventListener('alist-offline-cleared', update);
    return () => {
      active = false;
      window.removeEventListener('alist-offline-synced', update);
      window.removeEventListener('alist-offline-cleared', update);
    };
  }, []);
  return (
    <section className="device-library" aria-label="A-List on this device">
      <h3>On This Device</h3>
      <p role="status">{summary}</p>
      <p>
        A read-only copy of your saved films stays available without a connection. Sign-out and
        account changes clear it. Release dates update when you reconnect.
      </p>
      {available && (
        <button
          className="button subtle"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await clearOfflineLibrary();
              setAvailable(false);
              setSummary('Offline copy removed. Reload while signed in to sync a new copy.');
            } catch {
              setSummary('Could not remove the copy. Please try again.');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Removing…' : 'Remove Offline Copy'}
        </button>
      )}
      <details>
        <summary>Install A-List</summary>
        <p>
          Choose Install App or Add to Home Screen in your browser’s menu. On iPhone, open the Share
          menu, then choose Add to Home Screen.
        </p>
      </details>
      <a className="text-link" href="/offline.html">
        Open Offline Library
      </a>
    </section>
  );
}
