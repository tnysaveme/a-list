import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('privacy RPCs export the entire caller library and rotate only its feed, revoking old cache authorization', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
   create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
   grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
    const migrations = new URL('../supabase/migrations/', import.meta.url);
    for (const file of (await readdir(migrations)).filter((file) => file.endsWith('.sql')).sort())
      await db.exec(await readFile(new URL(file, migrations), 'utf8'));
    const owner = '11111111-1111-4111-8111-111111111111',
      other = '22222222-2222-4222-8222-222222222222';
    for (const id of [owner, other]) {
      await db.query('insert into auth.users(id) values($1)', [id]);
      await db.query('insert into public.a_list_accounts(id) values($1)', [id]);
    }
    assert.equal(
      (
        await db.query<{ included: boolean }>(
          'select bool_and(include_rumors) as included from public.a_list_accounts',
        )
      ).rows[0].included,
      true,
    );
    await db.exec(
      `insert into public.a_list_movies(id,movie) select n::text,jsonb_build_object('id',n::text,'title','Film '||n,'releases','[]'::jsonb) from generate_series(1,1002) n;`,
    );
    await db.query(
      "insert into public.a_list_library(user_id,movie_id,movie) select $1,id,movie from public.a_list_movies where id<>'1002'",
      [owner],
    );
    await db.query(
      "insert into public.a_list_library(user_id,movie_id,movie) select $1,id,movie from public.a_list_movies where id='1002'",
      [other],
    );
    type Account = { id: string; feed_token: string; calendar_revision: number };
    const accounts = (
      await db.query<Account>(
        'select id,feed_token,calendar_revision from public.a_list_accounts order by id',
      )
    ).rows;
    const original = accounts[0].feed_token;
    await db.exec('set role anon');
    for (const fn of ['a_list_export_library', 'a_list_rotate_calendar'])
      await assert.rejects(db.query(`select public.${fn}()`), /permission denied/);
    await db.exec('reset role;set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    const exported = (
      await db.query<{
        value: { schemaVersion: number; library: { movieId: string; releases: unknown[] }[] };
      }>('select public.a_list_export_library() as value')
    ).rows[0].value;
    assert.equal(exported.schemaVersion, 1);
    assert.equal(exported.library.length, 1001);
    assert.equal(
      exported.library.some((movie) => movie.movieId === '1002'),
      false,
    );
    assert.equal(
      exported.library.every((movie) => !movie.releases.length),
      true,
    );
    assert.equal(JSON.stringify(exported).includes(original), false);
    assert.equal(JSON.stringify(exported).includes(other), false);
    const reset = (
      await db.query<{ token: string }>('select public.a_list_rotate_calendar() as token')
    ).rows[0].token;
    assert.match(reset, /^[a-f0-9-]{68}$/);
    assert.notEqual(reset, original);
    assert.equal(
      (
        await db.query<{ state: null }>('select public.a_list_calendar_state($1) as state', [
          original,
        ])
      ).rows[0].state,
      null,
    );
    assert.notEqual(
      (
        await db.query<{ state: unknown }>('select public.a_list_calendar_state($1) as state', [
          reset,
        ])
      ).rows[0].state,
      null,
    );
    await db.exec('reset role');
    const after = (
      await db.query<Account>(
        'select id,feed_token,calendar_revision from public.a_list_accounts order by id',
      )
    ).rows;
    assert.deepEqual(after[1], accounts[1]);
    assert.equal(Number(after[0].calendar_revision), Number(accounts[0].calendar_revision) + 1);
    await db.query('delete from auth.users where id=$1', [owner]);
    assert.equal(
      (await db.query<{ state: null }>('select public.a_list_calendar_state($1) as state', [reset]))
        .rows[0].state,
      null,
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          'select count(*)::int as count from public.a_list_library where user_id=$1',
          [owner],
        )
      ).rows[0].count,
      0,
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          'select count(*)::int as count from public.a_list_library where user_id=$1',
          [other],
        )
      ).rows[0].count,
      1,
    );
  } finally {
    await db.close();
  }
});
