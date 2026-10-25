/** Coalesce simultaneous browser events and skip recently refreshed views. */
export function refreshGate(
  work: () => Promise<void>,
  {
    now = Date.now,
    minAgeMs = 60_000,
    freshAt = now(),
  }: { now?: () => number; minAgeMs?: number; freshAt?: number } = {},
) {
  let lastSuccess = freshAt,
    pending: Promise<void> | null = null;
  return () => {
    if (pending) return pending;
    if (now() - lastSuccess < minAgeMs) return Promise.resolve();
    pending = Promise.resolve()
      .then(work)
      .then(() => {
        lastSuccess = now();
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };
}
