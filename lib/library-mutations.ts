import type { SupabaseClient } from '@supabase/supabase-js';
import { checked } from './db-result';

export class MovieOnlyError extends Error {
  constructor() {
    super('A-List tracks movies only. TV series cannot be saved or tracked.');
    this.name = 'MovieOnlyError';
  }
}

export async function writeLibrary(
  db: SupabaseClient,
  userId: string,
  action: string,
  ids: string[],
  restored?: Record<string, string | null>,
) {
  if (action === 'remove') {
    checked(await db.from('a_list_library').delete().eq('user_id', userId).in('movie_id', ids));
  } else if (action === 'watch' || action === 'unwatch') {
    let update = db
      .from('a_list_library')
      .update({ watched_at: action === 'watch' ? new Date().toISOString() : null })
      .eq('user_id', userId)
      .in('movie_id', ids);
    // Retrying a confirmed/lost response must preserve the first watched timestamp.
    if (action === 'watch') update = update.is('watched_at', null);
    checked(await update);
  } else if (action === 'add' || action === 'track') {
    const rows = checked(await db.from('a_list_movies').select('id,movie').in('id', ids)) || [];
    if (rows.length !== ids.length) throw new Error('Film not found');
    // Validate the entire batch before changing any memberships or tracking flags.
    if (rows.some((row) => row.movie.mediaType === 'series')) throw new MovieOnlyError();
    if (action === 'track') {
      // Older clients may still send this after saving. Calendar membership is automatic.
      checked(
        await db
          .from('a_list_library')
          .update({ tracked: true })
          .eq('user_id', userId)
          .in('movie_id', ids),
      );
    } else {
      // Merge repeat saves to repair legacy membership, preserving the original added_at.
      checked(
        await db.from('a_list_library').upsert(
          rows.map((r) => ({
            user_id: userId,
            movie_id: r.id,
            movie: r.movie,
            tracked: true,
            ...(restored && Object.hasOwn(restored, r.id) ? { watched_at: restored[r.id] } : {}),
          })),
          { onConflict: 'user_id,movie_id' },
        ),
      );
    }
  } else throw new Error('Unknown library action');
}

export async function readLibraryState(db: SupabaseClient, userId: string, ids: string[]) {
  const rows =
    checked(
      await db
        .from('a_list_library')
        .select('movie_id,watched_at')
        .eq('user_id', userId)
        .in('movie_id', ids),
    ) || [];
  const saved = new Set(rows.map((row) => row.movie_id));
  const watched = new Map(rows.map((row) => [row.movie_id, row.watched_at as string | null]));
  return {
    membership: Object.fromEntries(ids.map((id) => [id, saved.has(id)])),
    watched: Object.fromEntries(ids.map((id) => [id, watched.get(id) || null])),
  };
}
