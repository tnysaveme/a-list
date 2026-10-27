export type SourceCheck = {
  lastAttempt?: string;
  lastSuccess?: string | null;
  lastFailure?: string | null;
  ok?: boolean;
  failures?: number;
};
export type SourceHealth = Record<string, SourceCheck>;
export const TRANSIENT_RETRY_MS = 15 * 60_000;
export function sourceHealthSummary(
  status: {
    last_success_at?: string | null;
    catalogue_success_at?: string | null;
    failures?: number;
    source_health?: SourceHealth;
  },
  now = Date.now(),
) {
  const health = status.source_health || {},
    stale = (stamp: string | null | undefined, age: number) =>
      !stamp || !Number.isFinite(Date.parse(stamp)) || now - Date.parse(stamp) > age;
  const issues: string[] = [];
  if (stale(status.last_success_at, 3600_000)) issues.push('refresh_job_stale');
  if (status.failures) issues.push('refresh_job_failed');
  if (stale(health.catalogue?.lastSuccess || status.catalogue_success_at, 8 * 3600_000))
    issues.push('catalogue_stale');
  if (stale(health.wts_feed?.lastSuccess, 7 * 3600_000)) issues.push('wts_feed_stale');
  for (const [source, check] of Object.entries(health))
    if (check.ok === false) issues.push(`${source}_failed`);
  return {
    status: issues.length ? ('degraded' as const) : ('healthy' as const),
    issues,
    checks: health,
  };
}
