import type { SupabaseClient } from '@supabase/supabase-js';
import type { Movie } from './model';
import { checked } from './db-result';
export type MovieRow = { id: string; movie: Movie; updated_at: string };

/** Keep URL length and each result below the Data API's row cap. */
export async function movieRows(
  db: SupabaseClient,
  ids: string[],
  signal?: AbortSignal,
): Promise<MovieRow[]> {
  const unique = [...new Set(ids)],
    rows: MovieRow[] = [];
  for (let offset = 0; offset < unique.length; offset += 200) {
    let query = db
      .from('a_list_movies')
      .select('id,movie,updated_at')
      .in('id', unique.slice(offset, offset + 200));
    if (signal) query = query.abortSignal(signal);
    rows.push(...(checked(await query) as MovieRow[]));
  }
  return rows;
}
