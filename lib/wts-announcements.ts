import 'server-only';
import type { adminDb } from './supabase/admin';
import { checked } from './db-result';
import type { FeedEntry } from './release-automation';

type Db = ReturnType<typeof adminDb>;
export async function queueWtsAnnouncements(entries: FeedEntry[], db: Db, signal: AbortSignal) {
  // Queue before trimming the recent RSS snapshot. A failed write leaves discovery retryable.
  for (let offset = 0; offset < entries.length; offset += 100)
    checked(
      await db
        .rpc('a_list_queue_wts_announcements', { p_entries: entries.slice(offset, offset + 100) })
        .abortSignal(signal),
    );
}
export async function dueWtsAnnouncements(
  db: Db,
  signal: AbortSignal,
  limit = 4,
): Promise<FeedEntry[]> {
  const rows = checked(
    await db.rpc('a_list_due_wts_announcements', { p_limit: limit }).abortSignal(signal),
  ) as FeedEntry[];
  return rows.map((entry) => ({ ...entry, durable: true }));
}
export async function checkpointWtsAnnouncements(
  entries: FeedEntry[],
  db: Db,
  signal: AbortSignal,
) {
  const completed = entries
    .filter((entry) => entry.durable && entry.checkedAt)
    .map((entry) => ({
      ...entry,
      measureFreshness:
        entry.outcome === 'matched' ||
        (!entry.partial &&
          ['withheld', 'verified_no_date', 'not_movie'].includes(entry.outcome || ''))
          ? false
          : entry.measureFreshness,
    }));
  if (completed.length)
    checked(
      await db
        .rpc('a_list_checkpoint_wts_announcements', { p_entries: completed })
        .abortSignal(signal),
    );
}
