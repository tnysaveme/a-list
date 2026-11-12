import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('collection revision is private, stable for checks and sensitive to release content and the caller library', async () => {
  const db = new PGlite();
  const first = '11111111-1111-4111-8111-111111111111',
    second = '22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
      create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
      grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;`);
    const dir = new URL('../supabase/migrations/', import.meta.url);
    for (const name of (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort())
      await db.exec(await readFile(new URL(name, dir), 'utf8'));
    await db.exec(`insert into auth.users values('${first}'),('${second}');
      insert into public.a_list_accounts(id) values('${first}'),('${second}');`);
    const source = 'https://www.dvdsreleasedates.com/movies/123/a-film';
    const movie = {
      id: '123',
      title: 'A Film',
      year: '2026',
      source,
      poster: '',
      checkedAt: '2026-10-29T00:00:00Z',
      releases: [
        {
          kind: 'Digital',
          date: '2099-01-01',
          confidence: 'listed',
          source,
          sourceName: 'DVDs Release Dates',
        },
      ],
    };
    await db.query('insert into public.a_list_movies(id,movie) values($1,$2)', [
      '123',
      JSON.stringify(movie),
    ]);
    const revision = async (id = first) => {
      await db.exec(
        `reset role;select set_config('request.jwt.claim.sub','${id}',false);set role authenticated;`,
      );
      return (
        await db.query<{ revision: string }>(
          'select public.a_list_collection_revision() as revision',
        )
      ).rows[0].revision;
    };
    const original = await revision();
    assert.match(original, /^[a-f0-9]{32}$/);
    assert.equal(await revision(), original);
    await db.exec("set timezone='Pacific/Auckland'");
    assert.equal(await revision(), original, 'connection timezone cannot change the revision');
    await db.exec(
      `reset role;update public.a_list_movies set movie=jsonb_set(movie,'{checkedAt}','"2099-01-01T00:00:00Z"'),updated_at=clock_timestamp() where id='123';`,
    );
    assert.equal(await revision(), original, 'a successful source check does not reload the list');
    await db.exec(
      `reset role;update public.a_list_movies set movie=jsonb_set(movie,'{releases,0,date}','"2099-02-01"') where id='123';`,
    );
    const changed = await revision();
    assert.notEqual(changed, original);
    const other = await revision(second);
    await db.exec(
      `reset role;insert into public.a_list_library(user_id,movie_id,movie,tracked) select '${first}',id,movie,true from public.a_list_movies where id='123';`,
    );
    assert.notEqual(await revision(), changed);
    assert.equal(await revision(second), other, 'another user library revision stays private');
    await db.exec('reset role;set role anon');
    await assert.rejects(
      db.query('select public.a_list_collection_revision()'),
      /permission denied/,
    );
    await db.exec(
      `reset role;select set_config('request.jwt.claim.sub','',false);set role service_role;`,
    );
    assert.equal(
      (await db.query<{ revision: null }>('select public.a_list_collection_revision() as revision'))
        .rows[0].revision,
      null,
    );
  } finally {
    await db.close();
  }
});
