import 'server-only';
import { adminDb } from './supabase/admin';
import { checked } from './db-result';
import { cached, remember, cache } from './infrastructure';
import { activeReleaseIdentities, MATCH_RULE_VERSION, type MatchRow } from './release-automation';
import {
  reviewedReportIdentities,
  type ReviewedReportIdentity,
} from './reviewed-report-identities';
import type { Movie } from './model';
import { versionedCache } from './versioned-cache';

// Old previews and production share Redis. Their supported matching rules can differ.
const identityCacheKey = `release-identities:v4:rule${MATCH_RULE_VERSION}`;

export async function releaseIdentities(): Promise<ReviewedReportIdentity[]> {
  return versionedCache(identityCacheKey, {
    version: async () => {
      const row = checked(
        await adminDb()
          .from('a_list_source_status')
          .select('identity_version')
          .eq('id', true)
          .single(),
      );
      if (!row?.identity_version) throw new Error('Release identity version unavailable');
      return row.identity_version as string;
    },
    read: (key) => cached<ReviewedReportIdentity[]>(key),
    write: (key, value) => remember(key, value, 3600),
    load: loadReleaseIdentities,
  });
}
async function loadReleaseIdentities(): Promise<ReviewedReportIdentity[]> {
  const rows: MatchRow[] = [];
  const db = adminDb();
  for (let offset = 0; ; offset += 500) {
    const page = checked(
      await db
        .from('a_list_release_candidates')
        .select(
          'source_id,profile,fingerprint,status,approved_imdb_id,reviewed_fingerprint,reviewed_at,rationale,checked_at,match_method,rule_version',
        )
        .order('source_id')
        .range(offset, offset + 499),
    ) as MatchRow[];
    rows.push(...page);
    if (page.length < 500) break;
  }
  return activeReleaseIdentities(rows, reviewedReportIdentities);
}
export type ReleaseImportRow = { id: string; movie: Movie; updated_at: string };
export async function releaseImports(): Promise<ReleaseImportRow[]> {
  const db = adminDb(),
    rows: ReleaseImportRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const page =
      (checked(
        await db
          .from('a_list_movies')
          .select('id,movie,updated_at')
          .eq('movie->>discoveredFrom', 'When To Stream')
          .order('id')
          .range(offset, offset + 499),
      ) as ReleaseImportRow[]) || [];
    rows.push(...page);
    if (page.length < 500) break;
  }
  return rows;
}
export async function invalidateReleaseCaches() {
  try {
    await cache().del(
      `alist:release-identities:v3:rule${MATCH_RULE_VERSION}`,
      'alist:release-identities:v2',
      'alist:approved-identities:v1',
      'alist:catalogue',
    );
  } catch {
    console.warn(JSON.stringify({ event: 'release_cache_invalidation_failed' }));
  }
}
