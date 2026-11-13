import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { mergeReleaseFeed } from '../lib/release-automation';

test('durable announcements survive RSS eviction, guard revisions and attempts, back off failures and remain service-only', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
   alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
   create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
   grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
    const dir = new URL('../supabase/migrations/', import.meta.url);
    for (const name of (await readdir(dir)).filter((n) => n.endsWith('.sql')).sort())
      await db.exec(await readFile(new URL(name, dir), 'utf8'));
    const time = new Date().toISOString();
    const entries = Array.from(
      { length: 90 },
      (_, i) =>
        mergeReleaseFeed(
          [],
          [
            {
              title: `Film ${i}`,
              release: {
                kind: 'Digital',
                date: '2026-11-20',
                confidence: 'listed',
                sourceName: 'When To Stream',
                source: `https://whentostream.com/film-${i}-digital/`,
              },
            },
          ],
          time,
        )[0],
    );
    const queue = (items: unknown[]) =>
      db.query('select public.a_list_queue_wts_announcements($1::jsonb)', [JSON.stringify(items)]);
    const due = async () =>
      (
        await db.query<{ v: (typeof entries)[0] }>(
          'select public.a_list_due_wts_announcements(16) as v',
        )
      ).rows.map((r) => r.v);
    const checkpoint = (entry: unknown) =>
      db.query('select public.a_list_checkpoint_wts_announcements($1::jsonb)', [
        JSON.stringify([entry]),
      ]);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(queue(entries), /permission denied/);
      await assert.rejects(due(), /permission denied/);
      await assert.rejects(checkpoint(entries[0]), /permission denied/);
      await assert.rejects(
        db.query('select * from public.a_list_wts_announcements'),
        /permission denied/,
      );
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    await db.query("select public.a_list_record_source_check('wts_reports',false)");
    await db.query("select public.a_list_record_source_check('wts_discovery',true)");
    assert.equal(
      (
        await db.query<{ ok: boolean }>(
          "select (source_health->'wts_reports'->>'ok')::boolean ok from public.a_list_source_status",
        )
      ).rows[0].ok,
      false,
      'Discovery cannot clear a report failure',
    );

    await queue(entries);
    assert.equal(
      (await db.query<{ n: number }>('select count(*)::int n from public.a_list_wts_announcements'))
        .rows[0].n,
      90,
    );
    assert.equal(
      mergeReleaseFeed(
        [],
        entries.map((e) => e.report),
        time,
      ).length,
      80,
      'Recent snapshot is bounded independently',
    );
    await db.exec(
      "update public.a_list_wts_announcements set last_seen_at=now()-interval '40 days',check_after=now()-interval '2 days'",
    );
    const batch = await due();
    assert.equal(batch.length, 16, 'Old unresolved work survives');
    const first = batch[0];
    await checkpoint({ ...first, checkedAt: time, outcome: 'source_unavailable' });
    const row = (
      await db.query<{ attempts: number; future: boolean }>(
        'select attempts,check_after>now() as future from public.a_list_wts_announcements where source=$1',
        [first.report.release.source],
      )
    ).rows[0];
    assert.deepEqual(row, { attempts: 1, future: true });
    await checkpoint({ ...first, checkedAt: time, outcome: 'matched' });
    assert.equal(
      (
        await db.query<{ attempts: number }>(
          'select attempts from public.a_list_wts_announcements where source=$1',
          [first.report.release.source],
        )
      ).rows[0].attempts,
      1,
      'Stale attempts cannot complete work',
    );
    const changed = { ...first, revision: 'f'.repeat(64), seenAt: time };
    await queue([changed]);
    await checkpoint({ ...first, attempts: 0, checkedAt: time, outcome: 'matched' });
    assert.equal(
      (
        await db.query<{ outcome: string | null }>(
          'select outcome from public.a_list_wts_announcements where source=$1',
          [first.report.release.source],
        )
      ).rows[0].outcome,
      null,
      'Stale revisions cannot complete work',
    );
    await queue([{ ...first, seenAt: '2020-01-01T00:00:00Z' }]);
    assert.equal(
      (
        await db.query<{ revision: string }>(
          'select revision from public.a_list_wts_announcements where source=$1',
          [first.report.release.source],
        )
      ).rows[0].revision,
      changed.revision,
    );
    await checkpoint({
      ...changed,
      queueVersion: 2,
      attempts: 0,
      checkedAt: time,
      outcome: 'matched',
      partial: false,
    });
    await db.exec(
      "update public.a_list_wts_announcements set last_seen_at=now()-interval '40 days'",
    );
    await queue([]);
    assert.equal(
      (await db.query<{ n: number }>('select count(*)::int n from public.a_list_wts_announcements'))
        .rows[0].n,
      89,
      'Only completed old work is pruned',
    );
    const health = (
      await db.query<{ v: { announcements: { due: number } } }>(
        'select public.a_list_queue_health() as v',
      )
    ).rows[0].v;
    assert.equal(health.announcements.due, 89);
    await assert.rejects(
      queue([
        {
          ...entries[0],
          report: {
            ...entries[0].report,
            release: { ...entries[0].report.release, source: 'https://evil.example/film/' },
          },
        },
      ]),
      /Invalid announcement/,
    );
  } finally {
    await db.close();
  }
});
