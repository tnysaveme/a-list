import type { SupabaseClient } from '@supabase/supabase-js';
import { checked } from './db-result';

export function coverageAuditDue(coverage: unknown, now = Date.now()) {
  const timestamp =
    coverage && typeof coverage === 'object' && 'checkedAt' in coverage
      ? coverage.checkedAt
      : undefined;
  const completedAt = typeof timestamp === 'string' ? Date.parse(timestamp) : NaN;
  // Missing, corrupt or future checkpoints cannot postpone recovery indefinitely.
  return !Number.isFinite(completedAt) || completedAt > now || now - completedAt >= 3600_000;
}

export async function auditCoverageWhenDue(
  db: SupabaseClient,
  coverage: unknown,
  signal: AbortSignal,
  now = Date.now(),
) {
  if (!coverageAuditDue(coverage, now)) return null;
  // The RPC writes wts_coverage.checkedAt atomically with successful repairs.
  // A failed RPC stays due; no separate attempt timestamp suppresses the next run.
  return checked(
    await db.rpc('a_list_reconcile_wts_coverage', { p_limit: 16 }).abortSignal(signal),
  );
}
