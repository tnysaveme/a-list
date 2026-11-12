export type SourceCheck = {
  lastAttempt?: string;
  lastSuccess?: string | null;
  lastFailure?: string | null;
  ok?: boolean;
  failures?: number;
};
export type SourceHealth = Record<string, SourceCheck>;
export const TRANSIENT_RETRY_MS = 15 * 60_000;
export const SOURCE_HEALTH_COLUMNS =
  'last_success_at,catalogue_success_at,failures,source_health,wts_profile_changes';
export function sourceHealthSummary(
  status: {
    last_success_at?: string | null;
    catalogue_success_at?: string | null;
    failures?: number;
    source_health?: SourceHealth;
    wts_profile_changes?: { checkedAt?: string; through?: string } | null;
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
  // Discovery runs every ten minutes. Allow missed runs and the fifteen-minute
  // failure retry, but don't let a successful unrelated job hide stale WTS data.
  if (stale(health.wts_feed?.lastSuccess, 30 * 60_000)) issues.push('wts_feed_stale');
  if (stale(status.wts_profile_changes?.checkedAt, 30 * 60_000)) issues.push('wts_discovery_stale');
  // A paginated catch-up can keep checking successfully without catching up.
  if (stale(status.wts_profile_changes?.through, 60 * 60_000)) issues.push('wts_discovery_lagging');
  for (const [source, check] of Object.entries(health))
    if (check.ok === false) issues.push(`${source}_failed`);
  return {
    status: issues.length ? ('degraded' as const) : ('healthy' as const),
    issues,
    checks: health,
  };
}
