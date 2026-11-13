import type { Release } from './model';
/** Keep the preferred date while retaining independently verified conflicting evidence. */
export function withReleaseConflict(preferred: Release, report: Release): Release {
  if (
    preferred.kind !== report.kind ||
    preferred.sourceName === 'When To Stream' ||
    preferred.confidence !== 'listed'
  )
    return preferred;
  const { conflictingRelease: _, ...evidence } = report;
  void _;
  return {
    ...preferred,
    conflictingRelease:
      report.confidence === 'listed' && report.date !== preferred.date ? evidence : undefined,
  };
}
export function releaseCheckedDate(release: Release) {
  return release.checkedAt && Number.isFinite(Date.parse(release.checkedAt))
    ? release.checkedAt.slice(0, 10)
    : undefined;
}
