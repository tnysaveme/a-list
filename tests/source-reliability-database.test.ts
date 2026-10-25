import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('saved-film lookups rotate independently of primary refreshes, enforce permissions, and preserve calendar content revisions', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   alter default privileges in schema public grant all on tables to service_role;
   create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
   grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
    const migrations = new URL('../supabase/migrations/', import.meta.url);
    for (const name of (await readdir(migrations)).filter((n) => n.endsWith('.sql')).sort())
      await db.exec(await readFile(new URL(name, migrations), 'utf8'));
    const owner = '11111111-1111-4111-8111-111111111111';
    await db.query('insert into auth.users values($1)', [owner]);
    await db.query('insert into public.a_list_accounts(id) values($1)', [owner]);
    const release = (kind: string) => ({
      kind,
      date: '2026-11-01',
      confidence: 'listed',
      source: 'https://example.com',
      sourceName: 'Test',
    });
    for (let i = 0; i < 6; i++) {
      const id = `tt${7000000 + i}`,
        movie = {
          id,
          title: `Film ${i}`,
          year: '2026',
          releases:
            i === 0
              ? [release('Digital')]
              : i === 1
                ? [release('Subscription')]
                : i === 2
                  ? [release('Digital'), release('Subscription')]
                  : [],
        };
      await db.query(
        "insert into public.a_list_movies(id,movie,refresh_after,report_lookup_after) values($1,$2::jsonb,now()+interval '1 day',now()-interval '1 day'+$3::interval)",
        [id, JSON.stringify(movie), `${i} seconds`],
      );
      if (i < 5)
        await db.query(
          'insert into public.a_list_library(user_id,movie_id,movie) values($1,$2,$3::jsonb)',
          [owner, id, JSON.stringify(movie)],
        );
    }
    await db.query(
      'update public.a_list_movies set movie=movie||\'{"year":""}\'::jsonb where id=\'tt7000004\'',
    );
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      for (const sql of [
        'select public.a_list_report_lookup_candidates(8)',
        "select public.a_list_record_source_check('wts_feed',true)",
      ])
        await assert.rejects(db.query(sql), /permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    const ids = async () =>
      (
        await db.query<{ id: string }>('select id from public.a_list_report_lookup_candidates(8)')
      ).rows.map((r) => r.id);
    assert.deepEqual(await ids(), ['tt7000000', 'tt7000001', 'tt7000003']);
    const before = (
      await db.query<{ stamp: string }>(
        "select calendar_updated_at::text as stamp from public.a_list_movies where id='tt7000000'",
      )
    ).rows[0].stamp;
    await db.query(
      "update public.a_list_movies set report_lookup_after=now()+interval '1 day' where id='tt7000000'",
    );
    assert.deepEqual(await ids(), ['tt7000001', 'tt7000003']);
    assert.equal(
      (
        await db.query<{ stamp: string }>(
          "select calendar_updated_at::text as stamp from public.a_list_movies where id='tt7000000'",
        )
      ).rows[0].stamp,
      before,
    );
    await db.query("select public.a_list_record_source_check('primary',false)");
    await db.query("select public.a_list_record_source_check('wts_feed',true)");
    await db.query("select public.a_list_record_source_check('primary',false)");
    let health = (
      await db.query<{
        h: Record<string, { ok: boolean; failures: number; lastSuccess: string | null }>;
      }>('select source_health as h from public.a_list_source_status')
    ).rows[0].h;
    assert.equal(health.primary.failures, 2);
    assert.equal(health.primary.lastSuccess, null);
    assert.equal(health.wts_feed.ok, true);
    assert.ok(health.wts_feed.lastSuccess);
    await db.query("select public.a_list_record_source_check('primary',true)");
    health = (
      await db.query<{ h: typeof health }>(
        'select source_health as h from public.a_list_source_status',
      )
    ).rows[0].h;
    assert.equal(health.primary.failures, 0);
    assert.ok(health.primary.lastSuccess);
    assert.equal(health.wts_feed.ok, true);
    await assert.rejects(
      db.query("select public.a_list_record_source_check('anything',true)"),
      /Invalid source/,
    );
  } finally {
    await db.close();
  }
});
