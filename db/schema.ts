/** Supabase/Postgres row contracts. SQL lives in supabase/migrations/. */
import type { Movie } from '../lib/model';
export type AccountRow = { id: string; feed_token: string; include_rumors: boolean };
export type LibraryRow = {
  user_id: string;
  movie_id: string;
  movie: Movie;
  tracked: boolean;
  added_at: string;
};
export type CacheRow = { user_id: string; key: string; value: unknown; updated_at: string };
