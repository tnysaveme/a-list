import 'server-only';
import { adminDb } from './supabase/admin';
import { checked } from './db-result';
import { text } from './sources';
import type { FeedEntry } from './release-automation';
import type { ReleaseDiagnostic } from './release-diagnostics';
import type { ReleaseAudit } from './release-reconciliation';
import { WTS_DISCOVERY_CACHE_MS } from './release-automation';

type Db = ReturnType<typeof adminDb>;
type ChangeCursor = { through?: string; before?: string; page?: number; checkedAt?: string };
export type InventoryState = {
  wts_profile_page?: number;
  wts_profile_after?: string | null;
  wts_profile_changes?: ChangeCursor;
};
export type InventoryRow = {
  source_id: string;
  source: string;
  title: string;
  film_year: string;
  modified_at: string;
  failures?: number;
  attempts?: number;
  priority?: number;
  movie_id?: string | null;
  saved?: boolean;
  check_after?: string;
  checked_at?: string | null;
};

export function parseProfileIndex(value: unknown): InventoryRow[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('WTS page index format changed');
  const rows: InventoryRow[] = [];
  for (const item of value) {
    if (
      !item ||
      !Number.isInteger(item.id) ||
      item.id < 1 ||
      typeof item.link !== 'string' ||
      typeof item.title?.rendered !== 'string' ||
      typeof item.modified_gmt !== 'string'
    )
      throw new Error('WTS page index format changed');
    const heading = text(item.title.rendered).match(/^(.*?)\s+\(((?:18|19|20)\d{2})\)$/);
    if (!heading) continue; // Calendars, archives and other non-film pages.
    const url = new URL(item.link),
      modified = item.modified_gmt + 'Z';
    if (
      url.origin !== 'https://whentostream.com' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/[a-z0-9-]+\/$/.test(url.pathname) ||
      !Number.isFinite(Date.parse(modified))
    )
      throw new Error('Invalid WTS page index subject');
    rows.push({
      source_id: String(item.id),
      source: url.href,
      title: heading[1].slice(0, 300),
      film_year: heading[2],
      modified_at: new Date(modified).toISOString(),
    });
  }
  return rows;
}

/** The public WordPress page index supplies a complete cursor, beyond recent RSS announcements. */
export async function indexWtsProfiles(state: InventoryState, db: Db, signal: AbortSignal) {
  if (state.wts_profile_after && Date.parse(state.wts_profile_after) > Date.now()) return;
  const page = state.wts_profile_page || 1;
  const response = await fetch(
    `https://whentostream.com/wp-json/wp/v2/pages?per_page=100&page=${page}&orderby=id&order=asc&_fields=id,link,title,modified_gmt`,
    {
      cache: 'no-store',
      signal,
      headers: { 'User-Agent': 'A-List/1.0 (personal US movie release tracker)' },
    },
  );
  const body = await response.text();
  if (body.length > 500_000) throw new Error('WTS page index too large');
  const data = JSON.parse(body);
  const end = response.status === 400 && data?.code === 'rest_post_invalid_page_number';
  if (!response.ok && !end) throw new Error('WTS page index unavailable');
  const rows = end ? [] : parseProfileIndex(data);
  if (rows.length)
    checked(await db.rpc('a_list_queue_wts_profiles', { p_profiles: rows }).abortSignal(signal));
  const total = Number(response.headers.get('x-wp-totalpages'));
  const finished = end || data.length < 100 || (total > 0 && page >= total);
  checked(
    await db
      .from('a_list_source_status')
      .update({
        wts_profile_page: finished ? 1 : Math.min(1000, page + 1),
        wts_profile_after: new Date(Date.now() + (finished ? 6 * 3600_000 : 0)).toISOString(),
        ...(finished ? { wts_profile_indexed_at: new Date().toISOString() } : {}),
      })
      .eq('id', true)
      .eq('wts_profile_page', page)
      .abortSignal(signal),
  );
  return true;
}

/** Poll only modified pages; the complete index remains an independent recovery scan. */
export async function indexWtsProfileChanges(state: InventoryState, db: Db, signal: AbortSignal) {
  const cursor = state.wts_profile_changes || {},
    now = Date.now();
  if (cursor.checkedAt && now - Date.parse(cursor.checkedAt) < WTS_DISCOVERY_CACHE_MS) return;
  const through = cursor.through || new Date(now - 6 * 3600_000).toISOString(),
    before = cursor.before || new Date(now).toISOString(),
    page = cursor.page || 1,
    // Re-read the boundary to tolerate equal timestamps and source/client clock jitter.
    after = new Date(Date.parse(through) - 2 * 60_000).toISOString();
  if (
    !Number.isFinite(Date.parse(before)) ||
    Date.parse(before) < Date.parse(through) ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 1000
  )
    throw new Error('Invalid WTS change cursor');
  const query = new URLSearchParams({
    per_page: '100',
    page: String(page),
    orderby: 'modified',
    order: 'asc',
    modified_after: after,
    modified_before: before,
    _fields: 'id,link,title,modified_gmt',
  });
  const response = await fetch(`https://whentostream.com/wp-json/wp/v2/pages?${query}`, {
    cache: 'no-store',
    signal,
    headers: { 'User-Agent': 'A-List/1.0 (personal US movie release tracker)' },
  });
  const body = await response.text();
  if (body.length > 500_000) throw new Error('WTS page changes too large');
  const data = JSON.parse(body);
  const end = page > 1 && response.status === 400 && data?.code === 'rest_post_invalid_page_number';
  if (!response.ok && !end) throw new Error('WTS page changes unavailable');
  const rows = end ? [] : parseProfileIndex(data);
  if (
    rows.some(
      (row) =>
        Date.parse(row.modified_at) < Date.parse(after) ||
        Date.parse(row.modified_at) > Date.parse(before),
    )
  )
    throw new Error('WTS page change filter ignored');
  if (rows.length)
    checked(await db.rpc('a_list_queue_wts_profiles', { p_profiles: rows }).abortSignal(signal));
  const total = Number(response.headers.get('x-wp-totalpages'));
  const finished = end || data.length < 100 || (total > 0 && page >= total);
  if (!finished && page === 1000) throw new Error('WTS page change cursor exhausted');
  // Advance only after queuing this page. Replay is safe if a write fails or another worker wins.
  checked(
    await db
      .from('a_list_source_status')
      .update({
        wts_profile_changes: {
          through: finished ? before : through,
          ...(!finished ? { before, page: page + 1 } : {}),
          checkedAt: new Date(now).toISOString(),
        },
      })
      .eq('id', true)
      .eq('wts_profile_changes', JSON.stringify(cursor))
      .abortSignal(signal),
  );
  return true;
}

export async function dueWtsProfiles(db: Db, signal: AbortSignal): Promise<InventoryRow[]> {
  return checked(
    await db.rpc('a_list_due_wts_profiles', { p_limit: 4 }).abortSignal(signal),
  ) as InventoryRow[];
}
export function inventoryEntries(rows: InventoryRow[]): FeedEntry[] {
  return rows.map((row) => ({
    sourceId: row.source_id,
    priority: row.priority,
    saved: row.saved,
    dueAt: row.check_after,
    checkedAt: row.checked_at || undefined,
    revision: row.modified_at,
    seenAt: new Date().toISOString(),
    report: {
      title: row.title,
      year: row.film_year,
      inventory: true,
      release: {
        source: row.source,
        sourceName: 'When To Stream',
        kind: 'Digital',
        confidence: 'listed',
        date: '',
      },
    },
  }));
}
export async function checkpointWtsProfiles(
  rows: InventoryRow[],
  decisions: {
    source: string;
    outcome: string;
    movieId?: string;
    audit?: ReleaseAudit;
    partial?: boolean;
    diagnostic?: ReleaseDiagnostic;
  }[],
  db: Db,
  signal: AbortSignal,
) {
  for (const row of rows) {
    const result = decisions.find((decision) => decision.source === row.source);
    if (!result) continue; // Unstarted work remains due.
    const complete =
      !result.partial &&
      ['matched', 'withheld', 'verified_no_date', 'not_movie'].includes(result.outcome);
    const localFailure =
      result.outcome === 'budget_exhausted' ||
      ['database', 'publication'].includes(result.diagnostic?.stage || '');
    const attempts = localFailure ? row.attempts || 0 : complete ? 0 : (row.attempts || 0) + 1;
    const failures = localFailure
      ? row.failures || 0
      : result.partial || result.outcome === 'source_unavailable'
        ? (row.failures || 0) + 1
        : 0;
    const delay = localFailure
      ? 60_000
      : failures
        ? Math.min((row.saved ? 6 : 24) * 3600_000, 10 * 60_000 * 2 ** Math.min(8, failures - 1))
        : complete
          ? 7 * 86400_000
          : Math.min(
              row.saved ? 86400_000 : 7 * 86400_000,
              86400_000 * 2 ** Math.min(3, attempts - 1),
            );
    checked(
      await db
        .from('a_list_wts_profiles')
        .update({
          checked_at: new Date().toISOString(),
          check_after: new Date(Date.now() + delay).toISOString(),
          outcome: result.outcome,
          failures,
          attempts,
          priority:
            !complete && !result.outcome.startsWith('conflicting_') && row.priority === 2 ? 2 : 0,
          movie_id: result.movieId || row.movie_id || null,
          audit: result.audit || {},
          diagnostic: result.diagnostic || {},
          ...(complete ? { last_success_at: new Date().toISOString() } : {}),
        })
        .eq('source_id', row.source_id)
        .eq('modified_at', row.modified_at)
        .eq('priority', row.priority || 0)
        .eq('attempts', row.attempts || 0)
        .abortSignal(signal),
    );
  }
}
