/** Wait between polls without spending requests while hidden/offline. Resume once, not in a burst. */
export function waitForForeground(signal: AbortSignal, delayMs = 0, onOffline?: () => void) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const due = Date.now() + delayMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function cleanup() {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('online', check);
      window.removeEventListener('offline', check);
      signal.removeEventListener('abort', abort);
    }
    function abort() {
      cleanup();
      reject(signal.reason);
    }
    function check() {
      clearTimeout(timer);
      if (navigator.onLine === false) {
        onOffline?.();
        return;
      }
      if (document.visibilityState !== 'visible') return;
      const remaining = due - Date.now();
      if (remaining > 0) timer = setTimeout(check, remaining);
      else {
        cleanup();
        resolve();
      }
    }
    document.addEventListener('visibilitychange', check);
    window.addEventListener('online', check);
    window.addEventListener('offline', check);
    signal.addEventListener('abort', abort, { once: true });
    check();
  });
}
