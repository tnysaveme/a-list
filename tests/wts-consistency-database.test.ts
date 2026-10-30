import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('consistency audit queues verified aliases without restoring snapshots, preserves withdrawals and primary preference, and orders fair service-only work', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
   alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
   create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
   grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
    const dir = new URL('../supabase/migrations/', import.meta.url);
    for (const n of (await readdir(dir)).filter((n) => n.endsWith('.sql')).sort())
      await db.exec(await readFile(new URL(n, dir), 'utf8'));
    const source = 'https://whentostream.com/a-film-2026/',
      imdb = 'tt7777777';
    const primary = {
      kind: 'Digital',
      date: '2099-01-01',
      confidence: 'listed',
      source: 'https://www.dvdsreleasedates.com/movies/123/a-film',
      sourceName: 'DVDs Release Dates',
    };
    const release = {
      kind: 'Subscription',
      date: '2099-02-01',
      confidence: 'listed',
      source,
      sourceName: 'When To Stream',
      filmImdbId: imdb,
      filmIdentityMethod: 'corroborated',
      filmIdentitySource: source,
    };
    const profile = {
      sourceFilmId: '7001',
      sourceFilmUrl: source,
      title: 'A Film',
      year: '2026',
      directors: ['A Director'],
      cast: ['One Actor', 'Two Actors'],
      overview: 'A film.',
    };
    const movie = {
      id: '123',
      imdbId: imdb,
      identityVerifiedAt: '2026-10-29T00:00:00Z',
      title: 'A Film',
      year: '2026',
      source: primary.source,
      poster: '',
      checkedAt: '2026-10-29T00:00:00Z',
      releases: [primary, release],
    };
    const mapping = {
      source_id: '7001',
      profile,
      fingerprint: 'a'.repeat(64),
      method: 'corroborated',
      imdb_id: imdb,
      status: 'approved',
      rationale: 'Independent credits',
      rule_version: 5,
      reports: [
        { title: 'A Film', imdbId: imdb, release },
        {
          title: 'A Film',
          imdbId: imdb,
          release: { ...release, kind: 'Digital', date: '2099-03-01' },
        },
      ],
      suggestions: [],
    };
    const queue = async (id = '7001') =>
      db.query('select public.a_list_queue_wts_profiles($1::jsonb)', [
        JSON.stringify([
          {
            source_id: id,
            source: id === '7001' ? source : `https://whentostream.com/film-${id}/`,
            title: 'A Film',
            film_year: '2026',
            modified_at: '2026-10-29T00:00:00Z',
          },
        ]),
      ]);
    const audit = async () => {
      const v = (
        await db.query<{ v: { queued: number; unexplained: number } }>(
          'select public.a_list_reconcile_wts_coverage(16) as v',
        )
      ).rows[0].v;
      return { queued: v.queued, unexplained: v.unexplained };
    };
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(audit(), /permission denied/);
      await assert.rejects(
        db.query('select public.a_list_due_wts_profiles(4)'),
        /permission denied/,
      );
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    await db.query('select public.a_list_store_release_match($1::jsonb,$2::jsonb,null,$3::jsonb)', [
      JSON.stringify(mapping),
      JSON.stringify(movie),
      JSON.stringify([release]),
    ]);
    await queue();
    assert.deepEqual(
      await audit(),
      { queued: 0, unexplained: 0 },
      'A listed primary date keeps priority despite a different WTS date',
    );
    await db.query('update public.a_list_movies set movie=$1::jsonb where id=$2', [
      JSON.stringify({ ...movie, releases: [primary] }),
      movie.id,
    ]);
    assert.deepEqual(await audit(), { queued: 1, unexplained: 1 });
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select jsonb_array_length(movie->'releases') as n from public.a_list_movies where id='123'",
        )
      ).rows[0].n,
      1,
      'Audit queues verification and cannot restore old evidence',
    );
    await db.exec(
      "update public.a_list_wts_profiles set check_after='2099-01-01',attempts=3 where source_id='7001'",
    );
    assert.deepEqual(await audit(), { queued: 0, unexplained: 1 });
    assert.ok(
      (
        await db.query<{ future: boolean }>(
          "select check_after>now() as future from public.a_list_wts_profiles where source_id='7001'",
        )
      ).rows[0].future,
      'Repeated audit keeps a failed repair backoff',
    );
    await db.query('update public.a_list_movies set movie=$1::jsonb where id=$2', [
      JSON.stringify(movie),
      movie.id,
    ]);
    assert.deepEqual(await audit(), { queued: 0, unexplained: 0 });
    const alias = {
      ...movie,
      id: imdb,
      source: `https://www.imdb.com/title/${imdb}/`,
      releases: [primary],
    };
    await db.query('insert into public.a_list_movies(id,movie) values($1,$2::jsonb)', [
      imdb,
      JSON.stringify(alias),
    ]);
    assert.equal((await audit()).unexplained, 1, 'Verified aliases receive consistency coverage');
    const version = (
      await db.query<{ v: string }>(
        "select updated_at::text as v from public.a_list_movies where id='123'",
      )
    ).rows[0].v;
    await db.query(
      "select public.a_list_withdraw_release_windows('123',$1,$2,array['Subscription'],$3)",
      [imdb, source, version],
    );
    assert.deepEqual(
      await audit(),
      { queued: 0, unexplained: 0 },
      'Explicit withdrawal retires proof rather than being automatically undone',
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select jsonb_array_length(reports) as n from public.a_list_release_candidates where source_id='7001'",
        )
      ).rows[0].n,
      1,
    );
    await db.query('select public.a_list_withhold_release_report($1)', [source]);
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select jsonb_array_length(reports) as n from public.a_list_release_candidates where source_id='7001'",
        )
      ).rows[0].n,
      0,
    );
    await db.exec(
      "reset role;insert into auth.users values('11111111-1111-4111-8111-111111111111');insert into public.a_list_accounts(id) values('11111111-1111-4111-8111-111111111111');insert into public.a_list_library(user_id,movie_id,tracked,movie) select '11111111-1111-4111-8111-111111111111',id,true,movie from public.a_list_movies where id='123';set role service_role",
    );
    for (const id of ['7002', '7003', '7004', '7005']) await queue(id);
    await db.exec(
      "update public.a_list_wts_profiles set priority=0,checked_at=now(),check_after=now()-interval '1 hour';update public.a_list_wts_profiles set priority=2 where source_id='7001';update public.a_list_wts_profiles set check_after=now()-interval '2 days' where source_id='7002';update public.a_list_wts_profiles set movie_id='123' where source_id='7003';update public.a_list_wts_profiles set priority=1 where source_id='7004'",
    );
    const order = (
      await db.query<{ v: { source_id: string; saved: boolean } }>(
        'select public.a_list_due_wts_profiles(8) as v',
      )
    ).rows;
    assert.deepEqual(
      order.map((r) => r.v.source_id),
      ['7001', '7002', '7003', '7004', '7005'],
    );
    assert.equal(order[2].v.saved, true);
    assert.equal(
      (await db.query<{ n: number }>('select count(*)::int as n from public.a_list_library'))
        .rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});
