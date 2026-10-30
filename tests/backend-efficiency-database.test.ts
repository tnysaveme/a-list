import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('account recovery is atomic and private; matching versions follow committed evidence changes', async () => {
  const db = new PGlite();
  const owner = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;
      alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
      create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
      grant usage on schema auth to anon,authenticated,service_role,supabase_auth_admin;
      grant execute on function auth.uid() to anon,authenticated,service_role;
      grant select,delete on auth.users to supabase_auth_admin;`);
    const dir = new URL('../supabase/migrations/', import.meta.url);
    for (const name of (await readdir(dir)).filter((n) => n.endsWith('.sql')).sort())
      await db.exec(await readFile(new URL(name, dir), 'utf8'));
    await db.exec(`insert into auth.users values('${owner}'),('${other}');
      insert into public.a_list_movies(id,movie) values('123','{"id":"123","title":"A Film","releases":[]}');
      select set_config('request.jwt.claim.sub','${owner}',false);set role authenticated;
      insert into public.a_list_library(user_id,movie_id,movie) select '${owner}',id,movie from public.a_list_movies;`);
    const readAccount = async () =>
      (
        await db.query<{ feed_token: string; calendar_revision: number; include_rumors: boolean }>(
          'select feed_token,calendar_revision,include_rumors from public.a_list_accounts',
        )
      ).rows[0];
    const saved = await readAccount();
    assert.ok(saved.feed_token);
    assert.equal(saved.calendar_revision, 1);
    await db.exec(`insert into public.a_list_accounts(id,include_rumors) values('${owner}',false)
      on conflict(id) do update set include_rumors=excluded.include_rumors;`);
    const settings = await readAccount();
    assert.equal(settings.feed_token, saved.feed_token);
    assert.equal(settings.include_rumors, false);
    assert.equal(settings.calendar_revision, 2);
    await assert.rejects(
      db.exec(`insert into public.a_list_library(user_id,movie_id,movie)
      select '${other}',id,movie from public.a_list_movies;`),
      /row-level security/,
    );
    await db.exec(`delete from public.a_list_library where user_id='${owner}';`);
    assert.equal((await readAccount()).calendar_revision, 3);
    await db.exec(`insert into public.a_list_library(user_id,movie_id,movie)
      select '${owner}',id,movie from public.a_list_movies;`);
    assert.equal((await readAccount()).feed_token, saved.feed_token);
    await db.exec(
      `reset role;set role supabase_auth_admin;delete from auth.users where id='${owner}';reset role;`,
    );
    assert.equal((await db.query('select * from public.a_list_accounts')).rows.length, 0);
    assert.equal((await db.query('select * from public.a_list_library')).rows.length, 0);

    const version = async () =>
      (
        await db.query<{ identity_version: string }>(
          'select identity_version from public.a_list_source_status where id',
        )
      ).rows[0].identity_version;
    const initial = await version();
    await db.exec(`set role service_role;insert into public.a_list_release_candidates
      (source_id,profile,fingerprint,reports,suggestions) values('1','{"sourceFilmId":"1"}',repeat('a',64),'[]','[]');`);
    const inserted = await version();
    assert.notEqual(inserted, initial);
    await db.exec(
      "update public.a_list_release_candidates set status='rejected' where source_id='1'",
    );
    const revoked = await version();
    assert.notEqual(revoked, inserted);
    await db.exec(
      "begin;update public.a_list_release_candidates set status='pending' where source_id='1';rollback;",
    );
    assert.equal(await version(), revoked, 'rolled-back evidence must not invalidate the cache');
    await db.exec("reset role;delete from public.a_list_release_candidates where source_id='1'");
    assert.notEqual(await version(), revoked);
    await db.exec('set role authenticated');
    await assert.rejects(
      db.exec("update public.a_list_source_status set identity_version='tampered'"),
      /permission denied/,
    );
    await assert.rejects(
      db.exec('select a_list_private.release_identities_changed()'),
      /permission denied/,
    );
    const privileges = (
      await db.query<{ prosecdef: boolean; proconfig: string[] }>(
        "select prosecdef,proconfig from pg_proc where oid='a_list_private.library_changed()'::regprocedure",
      )
    ).rows[0];
    assert.equal(privileges.prosecdef, false);
    assert.deepEqual(privileges.proconfig, ['search_path=""']);
  } finally {
    await db.close();
  }
});
