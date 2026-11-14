'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  beginOfflineSession,
  clearOfflineLibrary,
  saveOfflineLibrary,
} from '../public/offline-store.js';
import type { OfflineSnapshot } from '../lib/offline-library';

/** Public shell only. Authenticated HTML and API responses never enter Cache Storage. */
export function OfflineLifecycle() {
  const path = usePathname();
  useEffect(() => {
    if ('serviceWorker' in navigator)
      void navigator.serviceWorker
        .register('/sw.js', { type: 'module', updateViaCache: 'none' })
        .catch(() => {});
    const clear = () => {
      void clearOfflineLibrary().catch(() => {});
    };
    const submit = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || new URL(form.action).pathname !== '/auth/signout')
        return;
      event.preventDefault();
      void clearOfflineLibrary()
        .catch(() => {})
        .finally(() => form.submit());
    };
    const message = (event: MessageEvent) => {
      if (event.data?.type === 'offline-cleared') clear();
    };
    document.addEventListener('submit', submit, true);
    navigator.serviceWorker?.addEventListener('message', message);
    return () => {
      document.removeEventListener('submit', submit, true);
      navigator.serviceWorker?.removeEventListener('message', message);
    };
  }, []);
  useEffect(() => {
    if (path === '/login' || path.startsWith('/auth/')) void clearOfflineLibrary().catch(() => {});
  }, [path]);
  return null;
}

export function OfflineLibrarySync({ owner, revision }: { owner: string; revision: string }) {
  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    let running = false;
    let queued = false;
    let epoch: string;
    let last = 0;
    const stop = () => {
      stopped = true;
      controller.abort();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === 'alist-offline-cleared') stop();
    };
    const sync = async () => {
      if (stopped || !epoch || navigator.onLine === false || document.visibilityState !== 'visible')
        return;
      if (running) {
        queued = true;
        return;
      }
      running = true;
      try {
        const response = await fetch('/api/library/offline', {
          cache: 'no-store',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        });
        if (response.status === 401) {
          await clearOfflineLibrary();
          return;
        }
        if (!response.ok) return;
        const snapshot: OfflineSnapshot = await response.json();
        if (!stopped && snapshot.owner === owner) {
          const saved = await saveOfflineLibrary(snapshot, epoch);
          if (saved?.owner === owner && saved.epoch === epoch) {
            last = Date.now();
            window.dispatchEvent(new Event('alist-offline-synced'));
          } else stop();
        }
      } catch {
        /* Reading the last snapshot remains available during outages. */
      } finally {
        running = false;
        if (queued) {
          queued = false;
          void sync();
        }
      }
    };
    const foreground = () => {
      if (Date.now() - last > 60000) void sync();
    };
    window.addEventListener('alist-offline-cleared', stop);
    window.addEventListener('storage', storage);
    window.addEventListener('online', foreground);
    window.addEventListener('alist-offline-sync', foregroundSync);
    function foregroundSync() {
      void sync();
    }
    document.addEventListener('visibilitychange', foreground);
    let timer: ReturnType<typeof setTimeout>;
    void beginOfflineSession(owner)
      .then((value) => {
        epoch = value;
        if (!stopped) timer = setTimeout(() => void sync(), 500);
      })
      .catch(() => {});
    return () => {
      stop();
      clearTimeout(timer);
      window.removeEventListener('alist-offline-cleared', stop);
      window.removeEventListener('storage', storage);
      window.removeEventListener('online', foreground);
      window.removeEventListener('alist-offline-sync', foregroundSync);
      document.removeEventListener('visibilitychange', foreground);
    };
  }, [owner]);
  useEffect(() => {
    if (revision !== 'pending') window.dispatchEvent(new Event('alist-offline-sync'));
  }, [revision]);
  return null;
}
