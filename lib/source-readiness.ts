import 'server-only';
import type { adminDb } from './supabase/admin';
import { checked } from './db-result';
import { SOURCE_HEALTH_COLUMNS } from './source-health';
import type { WtsQueues } from './wts-work';
export async function sourceReadiness(db: ReturnType<typeof adminDb>, signal: AbortSignal) {
  const [row, queues] = await Promise.all([
    db
      .from('a_list_source_status')
      .select(`${SOURCE_HEALTH_COLUMNS},last_attempt_at,last_failure_at`)
      .eq('id', true)
      .abortSignal(signal)
      .single(),
    db.rpc('a_list_queue_health').abortSignal(signal),
  ]);
  return { ...checked(row), queues: checked(queues) as WtsQueues };
}
