import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { LibraryPage } from '../lib/pagination';

test('weekly library summary respects full-library scope, date boundaries, certainty and account isolation', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
      $$;
      grant usage on schema auth to authenticated,anon;
      grant execute on function auth.uid() to authenticated,anon;
    `);

    const migrations = new URL('../supabase/migrations/', import.meta.url);
    for (const name of (await readdir(migrations)).filter((n) => n.endsWith('.sql')).sort())
      await db.exec(await readFile(new URL(name, migrations), 'utf8'));
    const owner = '11111111-1111-4111-8111-111111111111';
    const other = '22222222-2222-4222-8222-222222222222';
    for (const id of [owner, other]) {
      await db.query('insert into auth.users(id) values($1)', [id]);
      await db.query('insert into public.a_list_accounts(id) values($1)', [id]);
    }
    const today = (
      await db.query<{ day: string }>(
        "select to_char(now() at time zone 'America/New_York','YYYY-MM-DD') as day",
      )
    ).rows[0].day;
    const date = (days: number) => {
      const value = new Date(today + 'T12:00:00Z');
      value.setUTCDate(value.getUTCDate() + days);
      return value.toISOString().slice(0, 10);
    };
    for (const [id, days, confidence, user] of [
      ['901', 0, 'listed', owner],
      ['902', 1, 'rumored', owner],
      ['903', 6, 'listed', owner],
      ['904', 7, 'listed', owner],
      ['905', -1, 'listed', owner],
      ['906', 0, 'listed', other],
    ] as const) {
      const movie = {
        id,
        title: id,
        year: '2026',
        poster: '',
        source: 'https://example.invalid',
        releases: [
          {
            date: date(days),
            kind: 'Digital',
            confidence,
            source: 'https://www.dvdsreleasedates.com/movies/1/test',
            sourceName: 'DVDs Release Dates',
          },
        ],
      };
      await db.query('insert into public.a_list_movies(id,movie) values($1,$2::jsonb)', [
        id,
        JSON.stringify(movie),
      ]);
      await db.query(
        'insert into public.a_list_library(user_id,movie_id,movie) values($1,$2,$3::jsonb)',
        [user, id, JSON.stringify(movie)],
      );
    }
    await db.query(`update public.a_list_movies set movie=jsonb_set(movie,'{releases}',
      jsonb_build_array(
        (movie->'releases'->0)||'{"confidence":"rumored","kind":"Subscription"}'::jsonb,
        movie->'releases'->0,
        (movie->'releases'->0)||'{"date":"2026-02-30"}'::jsonb,
        (movie->'releases'->0)||'{"date":"2099-01-01","confidence":"unexpected"}'::jsonb
      )) where id='901'`);
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    const page = async (filter = 'all', offset = 0) =>
      (
        await db.query<{ page: LibraryPage }>(
          "select public.a_list_library_page('title',$1,$2,1,false) as page",
          [filter, offset],
        )
      ).rows[0].page;
    assert.deepEqual(
      (await page()).weekReleases?.map((e) => e.movie.id),
      ['901', '902', '903'],
    );
    assert.deepEqual(
      (await page('unknown', 200)).weekReleases,
      (await page()).weekReleases,
      'summary must not depend on visible filter or page',
    );
    const fullPage = async (filter: string) =>
      (
        await db.query<{ page: LibraryPage }>(
          "select public.a_list_library_page('release',$1,0,50,false) as page",
          [filter],
        )
      ).rows[0].page;
    assert.deepEqual(
      (await fullPage('available')).movies.map((m) => m.id),
      ['901', '905'],
    );
    assert.deepEqual(
      (await fullPage('soon')).movies.map((m) => m.id),
      ['902', '903', '904'],
    );
    assert.equal((await fullPage('all')).upcoming?.id, '901');
    assert.equal((await fullPage('all')).upcomingRelease?.confidence, 'listed');
    assert.equal((await fullPage('all')).weekReleases?.[0].release.confidence, 'listed');
    assert.equal((await fullPage('available')).movies[0].releases.length, 2);
    await db.query('update public.a_list_accounts set include_rumors=false where id=auth.uid()');
    assert.deepEqual(
      (await page()).weekReleases?.map((e) => e.movie.id),
      ['901', '903'],
    );
    await db.query('delete from public.a_list_library where user_id=auth.uid() and movie_id=$1', [
      '901',
    ]);
    assert.deepEqual(
      (await page()).weekReleases?.map((e) => e.movie.id),
      ['903'],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
    assert.deepEqual(
      (await page()).weekReleases?.map((e) => e.movie.id),
      ['906'],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await db.query('update public.a_list_accounts set include_rumors=true where id=auth.uid()');
    await db.exec('reset role');
    for (let index = 0; index < 12; index++) {
      const id = String(1000 + index);
      const movie = {
        id,
        title: `Busy week ${index}`,
        year: '2026',
        poster: '',
        releases: [
          {
            date: date(index % 7),
            kind: 'Digital',
            confidence: 'listed',
            source: 'https://www.dvdsreleasedates.com/movies/1/test',
            sourceName: 'DVDs Release Dates',
          },
        ],
      };
      await db.query('insert into public.a_list_movies(id,movie) values($1,$2::jsonb)', [
        id,
        JSON.stringify(movie),
      ]);
      await db.query(
        'insert into public.a_list_library(user_id,movie_id,movie) values($1,$2,$3::jsonb)',
        [owner, id, JSON.stringify(movie)],
      );
    }
    await db.exec('set role authenticated');
    const expanded = (await page()).weekReleases!;
    assert.equal(
      expanded.length,
      14,
      'all saved releases in the week must be returned, beyond the original three',
    );
    assert.equal(new Set(expanded.map(({ movie }) => movie.id)).size, 14);
    assert.ok(
      expanded.every(
        (entry, index) => index === 0 || expanded[index - 1].release.date <= entry.release.date,
      ),
    );
    assert.deepEqual((await page('unknown', 200)).weekReleases, expanded);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
    assert.deepEqual(
      (await page()).weekReleases?.map(({ movie }) => movie.id),
      ['906'],
    );
    await db.exec('reset role; set role anon');
    await assert.rejects(page(), /permission denied/);
  } finally {
    await db.close();
  }
});
