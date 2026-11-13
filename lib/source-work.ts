import type { ReleaseDiagnostic } from './release-diagnostics';
/** A bounded pause, a provider failure and a failed commit require different retries. */
export function sourceWorkSummary(
  decisions: { outcome: string; partial?: boolean; diagnostic?: ReleaseDiagnostic }[],
) {
  let sourceFailures = 0,
    operationalFailures = 0,
    checked = 0;
  for (const decision of decisions) {
    const deferred =
      decision.outcome === 'budget_exhausted' ||
      ['budget_exhausted', 'version_conflict'].includes(decision.diagnostic?.category || '');
    if (deferred) continue;
    if (['database', 'publication'].includes(decision.diagnostic?.stage || '')) {
      operationalFailures++;
      continue;
    }
    checked++;
    if (decision.partial || decision.outcome === 'source_unavailable') sourceFailures++;
  }
  return { sourceFailures, operationalFailures, checked };
}
