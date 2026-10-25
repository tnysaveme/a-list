import 'server-only';
import { checked } from './db-result';
import type { adminDb } from './supabase/admin';
export async function recordSourceCheck(
  db: ReturnType<typeof adminDb>,
  source: string,
  success: boolean,
) {
  checked(
    await db
      .rpc('a_list_record_source_check', { p_source: source, p_success: success })
      .abortSignal(AbortSignal.timeout(3000)),
  );
  console.info(JSON.stringify({ event: 'source_check', source, success }));
}
