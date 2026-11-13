import { sourceIssue } from './source-errors';

export type ReleaseStage = 'profile' | 'identity' | 'database' | 'publication';
export type ReleaseDiagnostic = {
  stage: ReleaseStage;
  provider?: 'primary' | 'metadata' | 'wts';
  category: string;
  durationMs: number;
  status?: number;
};

/** Persist categories only: raw errors may contain credentials or private request URLs. */
export function releaseDiagnostic(
  error: unknown,
  stage: ReleaseStage,
  durationMs: number,
  aborted = false,
): ReleaseDiagnostic {
  const message = error instanceof Error ? error.message : '';
  const issue = sourceIssue(error, stage === 'identity' ? 'metadata' : 'wts');
  return {
    stage,
    category: /Catalogue changed|version|concurrent/i.test(message)
      ? 'version_conflict'
      : aborted
        ? 'budget_exhausted'
        : ['database', 'publication'].includes(stage)
          ? 'database_unavailable'
          : /insufficient_evidence|ambiguous_identity/.test(message)
            ? /insufficient_evidence|ambiguous_identity/.exec(message)![0]
            : issue.category,
    durationMs: Math.max(0, Math.round(durationMs)),
    ...(issue.status ? { status: issue.status } : {}),
  };
}
