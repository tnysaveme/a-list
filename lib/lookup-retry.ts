import type { ReleaseDiagnostic } from './release-diagnostics';
/** Failures reduce background traffic; local contention never becomes a provider outage. */
export function lookupRetrySeconds(
  diagnostic: ReleaseDiagnostic | undefined,
  failures: number,
  saved: boolean,
) {
  if (
    diagnostic &&
    (['database', 'publication'].includes(diagnostic.stage) ||
      ['budget_exhausted', 'version_conflict'].includes(diagnostic.category))
  )
    return 60;
  const persistent =
    diagnostic &&
    ['format_changed', 'identity_conflict', 'not_listed'].includes(diagnostic.category);
  const initial = persistent ? 3600 : 600;
  const cap = persistent ? (saved ? 86400 : 7 * 86400) : 6 * 3600;
  return Math.min(cap, initial * 2 ** Math.min(10, Math.max(0, failures)));
}
export function lookupSourceFailure(diagnostic: ReleaseDiagnostic | undefined) {
  return (
    !diagnostic ||
    (!['database', 'publication'].includes(diagnostic.stage) &&
      !['budget_exhausted', 'version_conflict'].includes(diagnostic.category))
  );
}
