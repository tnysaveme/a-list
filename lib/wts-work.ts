export type WorkQueue = { due?: number; oldestDueAt?: string | null };
export type WtsQueues = Partial<
  Record<'profiles' | 'announcements' | 'saved' | 'lookups', WorkQueue>
>;
/** Catch up within the existing deadline and two-request concurrency, after saved-film work. */
export function wtsWorkLimit(queues: WtsQueues, now = Date.now()) {
  const pending = [queues.profiles, queues.announcements];
  return pending.reduce((total, queue) => total + (queue?.due || 0), 0) >= 8 ||
    pending.some(
      (queue) => (queue?.due || 0) > 0 && now - Date.parse(queue?.oldestDueAt || '') > 30 * 60_000,
    )
    ? 16
    : 5;
}
