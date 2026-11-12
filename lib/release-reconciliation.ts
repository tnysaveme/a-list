import type { Movie, Release } from './model';
export type ReleaseAudit = {
  missing: number;
  changed: number;
  withdrawn: number;
  primaryPreferred: number;
  unknownKinds: Release['kind'][];
};

/** Compare source evidence with stored windows, respecting the existing primary-source priority. */
export function reconcileReleaseDates(
  movie: Movie | undefined,
  reports: Release[],
  source: string,
  withdrawnKinds: Release['kind'][] = [],
  unknownKinds: Release['kind'][] = [],
): ReleaseAudit {
  const audit: ReleaseAudit = {
    missing: 0,
    changed: 0,
    withdrawn: 0,
    primaryPreferred: 0,
    unknownKinds,
  };
  for (const report of reports) {
    const existing = movie?.releases.find((release) => release.kind === report.kind);
    if (!existing) audit.missing++;
    else if (existing.sourceName !== 'When To Stream' && existing.confidence === 'listed') {
      if (existing.date !== report.date) audit.primaryPreferred++;
    } else if (
      existing.date !== report.date ||
      existing.platform !== report.platform ||
      existing.confidence !== report.confidence
    )
      audit.changed++;
  }
  audit.withdrawn =
    movie?.releases.filter(
      (release) =>
        release.source === source &&
        release.sourceName === 'When To Stream' &&
        withdrawnKinds.includes(release.kind),
    ).length || 0;
  return audit;
}
