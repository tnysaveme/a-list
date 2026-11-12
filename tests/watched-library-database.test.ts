import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { LibraryPage } from '../lib/pagination';

test('watched history is private, paginated, reversible, and excluded from calendar events and summaries', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
      grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    const root = new URL('../supabase/migrations/', import.meta.url);
    for (const file of (await readdir(root)).filter((name) => name.endsWith('.sql')).sort())
      await db.exec(await readFile(new URL(file, root), 'utf8'));
    const owner = '11111111-1111-4111-8111-111111111111',
      other = '22222222-2222-4222-8222-222222222222';
    const movie = {
      id: '901',
      title: 'Watched Film',
      year: '2026',
      poster: '',
      source: 'https://example.invalid',
      releases: [
        {
          kind: 'Digital',
          confidence: 'listed',
          date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
          source: 'https://example.invalid',
          sourceName: 'Fixture',
        },
      ],
    };
    await db.query('insert into public.a_list_movies(id,movie) values($1,$2::jsonb)', [
      '901',
      JSON.stringify(movie),
    ]);
    for (const id of [owner, other]) {
      await db.query('insert into auth.users(id) values($1)', [id]);
      await db.query('insert into public.a_list_accounts(id) values($1)', [id]);
      await db.query(
        'insert into public.a_list_library(user_id,movie_id,movie) values($1,$2,$3::jsonb)',
        [id, '901', JSON.stringify(movie)],
      );
    }
    const token = (
      await db.query<{ feed_token: string }>(
        'select feed_token from public.a_list_accounts where id=$1',
        [owner],
      )
    ).rows[0].feed_token;
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    const page = async (filter = 'all') =>
      (
        await db.query<{ page: LibraryPage }>(
          "select public.a_list_library_page('added',$1,0,25,false) page",
          [filter],
        )
      ).rows[0].page;
    const feed = async () =>
      (
        await db.query<{ feed: { movies: { id: string }[] } }>(
          'select public.a_list_calendar_feed($1) feed',
          [token],
        )
      ).rows[0].feed;
    assert.equal((await feed()).movies.length, 1);
    const before = (
      await db.query<{ value: unknown }>('select public.a_list_calendar_state($1) value', [token])
    ).rows[0].value;
    await db.query('update public.a_list_library set watched_at=$1 where user_id=auth.uid()', [
      '2026-11-04T12:00:00Z',
    ]);
    const watching = await page(),
      watched = await page('watched');
    assert.equal(watching.total, 1);
    assert.equal(watching.watchedTotal, 1);
    assert.equal(watching.filteredTotal, 0);
    assert.equal(watching.trackedCount, 0);
    assert.equal(watching.listedEvents, 0);
    assert.equal(watching.upcoming, null);
    assert.deepEqual(watching.weekReleases, []);
    assert.equal(watched.movies[0].id, '901');
    assert.equal(watched.movies[0].tracked, false);
    assert.ok(watched.movies[0].watchedAt);
    const stamp = watched.movies[0].watchedAt;
    assert.equal((await feed()).movies.length, 0);
    assert.notDeepEqual(
      (await db.query<{ value: unknown }>('select public.a_list_calendar_state($1) value', [token]))
        .rows[0].value,
      before,
    );
    const exported = (
      await db.query<{ value: { library: { watchedAt: string; calendarTracking: boolean }[] } }>(
        'select public.a_list_export_library() value',
      )
    ).rows[0].value;
    assert.equal(exported.library[0].watchedAt, stamp);
    assert.equal(exported.library[0].calendarTracking, false);
    await db.query(
      'insert into public.a_list_library(user_id,movie_id,movie,tracked) values($1,$2,$3::jsonb,true) on conflict(user_id,movie_id) do update set tracked=excluded.tracked',
      [owner, '901', JSON.stringify(movie)],
    );
    assert.equal(
      (await page('watched')).movies[0].watchedAt,
      stamp,
      'repeat saves retain watched history',
    );
    assert.equal(
      (await feed()).movies.length,
      0,
      'legacy tracking writes cannot re-add watched films',
    );
    assert.equal(
      (
        await db.query(
          'update public.a_list_library set watched_at=now() where user_id=$1 returning movie_id',
          [other],
        )
      ).rows.length,
      0,
    );
    await db.query('update public.a_list_library set watched_at=null where user_id=auth.uid()');
    assert.equal((await page()).movies.length, 1);
    assert.equal((await feed()).movies.length, 1);
    await db.query('update public.a_list_library set watched_at=$1 where user_id=auth.uid()', [
      stamp,
    ]);
    await db.query('delete from public.a_list_library where user_id=auth.uid()');
    await db.query(
      'insert into public.a_list_library(user_id,movie_id,movie,watched_at,tracked) values($1,$2,$3::jsonb,$4,true)',
      [owner, '901', JSON.stringify(movie), stamp],
    );
    assert.equal(
      (await page('watched')).movies[0].watchedAt,
      stamp,
      'Undo retains the original watched date',
    );
    assert.equal((await feed()).movies.length, 0);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
    assert.equal((await page()).movies[0].watchedAt, null);
    assert.equal((await page('watched')).filteredTotal, 0);
    await db.exec('reset role');
    const access = (
      await db.query<{ allowed: boolean }>(
        "select has_function_privilege('anon','public.a_list_library_page(text,text,integer,integer,boolean)','execute') allowed",
      )
    ).rows[0];
    assert.equal(access.allowed, false);
    await db.exec('set role anon');
    await assert.rejects(
      db.query("select public.a_list_library_page('added','watched',0,25,false)"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
