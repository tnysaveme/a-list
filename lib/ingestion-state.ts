import type { SupabaseClient } from '@supabase/supabase-js';
import { checked } from './db-result';
import type { Movie } from './model';
import type { FeedEntry } from './release-automation';

/** Large snapshots are fetched only if the worker reaches catalogue/feed discovery. */
export function ingestionPayload(db: SupabaseClient, signal: AbortSignal) {
  let pending:
    | Promise<{ catalogue: Movie[]; wts_feed: FeedEntry[]; wts_feed_after: string | null }>
    | undefined;
  return () =>
    (pending ??= (async () => {
      const row = checked(
        await db
          .from('a_list_source_status')
          .select('catalogue,wts_feed,wts_feed_after')
          .eq('id', true)
          .abortSignal(signal)
          .single(),
      );
      if (!row) throw new Error('Source snapshot unavailable');
      return {
        catalogue: row.catalogue || [],
        wts_feed: row.wts_feed || [],
        wts_feed_after: row.wts_feed_after,
      };
    })());
}
