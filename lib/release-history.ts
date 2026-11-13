import type { Release } from './model';
export type ReleaseHistoryValue = Pick<
  Release,
  'date' | 'confidence' | 'source' | 'sourceName' | 'platform' | 'checkedAt'
> & { identityMethod?: string };
export type ReleaseHistoryEntry = {
  id: string;
  kind: Release['kind'];
  previous: ReleaseHistoryValue | null;
  current: ReleaseHistoryValue | null;
  changedAt: string;
  reason:
    | 'listed'
    | 'date_changed'
    | 'withdrawn'
    | 'source_changed'
    | 'confidence_changed'
    | 'platform_changed';
  sourceRevision: string | null;
};
