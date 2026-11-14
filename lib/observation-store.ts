import 'server-only';
import { cache } from './infrastructure';
import { checked } from './db-result';
import type { adminDb } from './supabase/admin';
import { observationKey, observationSnapshot } from './observations';

export async function retainObservations(db: ReturnType<typeof adminDb>, signal: AbortSignal) {
  // The scheduled worker alone checkpoints absolute snapshots, including the two
  // previous days for midnight/retry recovery. Replays are version-guarded in SQL.
  const days = Array.from({ length: 3 }, (_, i) =>
    new Date(Date.now() - i * 86400000).toISOString().slice(0, 10),
  );
  const results = await Promise.allSettled([
    (async () => {
      for (const day of days) {
        signal.throwIfAborted();
        const snapshot = observationSnapshot(
          await cache().hgetall<Record<string, unknown>>(observationKey(day)),
        );
        if (!snapshot) continue;
        checked(
          await db
            .rpc('a_list_retain_observations', {
              p_day: day,
              p_generation: snapshot.generation,
              p_version: snapshot.version,
              p_fields: snapshot.fields,
            })
            .abortSignal(signal),
        );
      }
    })(),
    (async () => checked(await db.rpc('a_list_capture_wts_health').abortSignal(signal)))(),
  ]);
  // A broken metric buffer cannot suppress the independent database health snapshot.
  if (results.some((result) => result.status === 'rejected'))
    throw new Error('Observation checkpoint incomplete');
}
