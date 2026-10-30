import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { makeCalendar } from '../lib/calendar';
import type { Movie, Release } from '../lib/model';
import type { LibraryPage } from '../lib/pagination';

test('grouped calendar counts agree with feed events across preferences, pagination, edits and accounts', async () => {
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
    const migration = '20261030095442_grouped_calendar_events.sql';
    const names = (await readdir(migrations)).filter((name) => name.endsWith('.sql')).sort();
    for (const name of names.filter((name) => name < migration))
      await db.exec(await readFile(new URL(name, migrations), 'utf8'));
    const owner = '11111111-1111-4111-8111-111111111111';
    const other = '22222222-2222-4222-8222-222222222222';
    for (const id of [owner, other]) {
      await db.query('insert into auth.users(id) values($1)', [id]);
      await db.query('insert into public.a_list_accounts(id) values($1)', [id]);
    }
    const release = (
      kind: Release['kind'],
      date = '2026-11-03',
      confidence: Release['confidence'] = 'listed',
    ): Release => ({
      kind,
      date,
      confidence,
      source: 'https://www.dvdsreleasedates.com/movies/1/a-film',
      sourceName: 'DVDs Release Dates',
    });
    const sameDay = [release('Digital'), release('PVOD'), release('Subscription')];
    const distinctDays = [
      release('Digital'),
      release('PVOD', '2026-11-10'),
      release('Subscription', '2026-11-20'),
    ];
    const windows: Release[][] = [
      sameDay,
      distinctDays,
      sameDay.map((r) => ({ ...r, confidence: 'rumored' })),
      sameDay.map((r) => ({ ...r, confidence: r.kind === 'PVOD' ? 'listed' : 'rumored' })),
      [],
      [
        release('Digital', '2026-02-31'),
        release('PVOD', 'not-a-date'),
        { ...release('Subscription'), sourceName: 'When To Stream', filmImdbId: 'tt9999999' },
      ],
      [release('Digital'), release('Subscription', '2026-11-20', 'rumored')],
      sameDay,
      distinctDays,
    ];
    const films: Movie[] = windows.map((releases, index) => ({
      id: String(index + 1),
      title: 'Same title',
      year: '2026',
      poster: '',
      source: 'https://example.com',
      checkedAt: '2026-10-23T12:00:00.000Z',
      releases,
    }));
    for (const film of films) {
      await db.query('insert into public.a_list_movies(id,movie) values($1,$2::jsonb)', [
        film.id,
        JSON.stringify(film),
      ]);
      await db.query(
        'insert into public.a_list_library(user_id,movie_id,movie,tracked) values($1,$2,$3::jsonb,$4)',
        [film.id === '9' ? other : owner, film.id, JSON.stringify(film), film.id !== '8'],
      );
    }
    const snapshot = async () => ({
      movies: (await db.query('select * from public.a_list_movies order by id')).rows,
      library: (await db.query('select * from public.a_list_library order by user_id,movie_id'))
        .rows,
      accounts: (await db.query('select * from public.a_list_accounts order by id')).rows,
    });
    const before = await snapshot();
    for (const name of names.filter((name) => name >= migration))
      await db.exec(await readFile(new URL(name, migrations), 'utf8'));
    assert.deepEqual(await snapshot(), before, 'the migration only replaces the summary function');
    const permissions = (
      await db.query<{ definer: boolean; settings: string[] }>(
        "select prosecdef as definer,proconfig as settings from pg_proc where oid='public.a_list_library_page(text,text,integer,integer,boolean)'::regprocedure",
      )
    ).rows[0];
    assert.equal(permissions.definer, false);
    assert.ok(permissions.settings.includes('search_path=""'));
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    const page = async (offset = 0, filter = 'all') =>
      (
        await db.query<{ page: LibraryPage }>(
          'select public.a_list_library_page($1,$2,$3,1,false) as page',
          ['title', filter, offset],
        )
      ).rows[0].page;
    const countEvents = (movies: Movie[], includeRumors: boolean) =>
      (makeCalendar(movies, { includeRumors }).match(/BEGIN:VEVENT/g) || []).length;
    const assertCounts = async (movies: Movie[]) => {
      for (const includeRumors of [true, false]) {
        await db.query('update public.a_list_accounts set include_rumors=$1 where id=auth.uid()', [
          includeRumors,
        ]);
        const summary = await page();
        assert.equal(
          summary.listedEvents + (includeRumors ? summary.rumoredEvents : 0),
          countEvents(movies, includeRumors),
        );
        assert.equal(summary.movies.length, 1, 'global counts do not depend on the loaded page');
      }
    };
    const tracked = films.slice(0, 7);
    const summary = await page();
    assert.equal(summary.listedEvents, 6);
    assert.equal(summary.rumoredEvents, 2);
    assert.equal(summary.trackedCount, 7);
    await assertCounts(tracked);
    for (const [offset, filter] of [
      [3, 'all'],
      [0, 'unknown'],
    ] as const) {
      const filtered = await page(offset, filter);
      assert.equal(filtered.listedEvents, summary.listedEvents);
      assert.equal(filtered.rumoredEvents, summary.rumoredEvents);
    }
    const update = async (movie: Movie) => {
      await db.exec('reset role');
      await db.query('update public.a_list_movies set movie=$1::jsonb where id=$2', [
        JSON.stringify(movie),
        movie.id,
      ]);
      tracked[Number(movie.id) - 1] = movie;
      await db.exec('set role authenticated');
    };
    await update({ ...tracked[0], releases: distinctDays });
    await assertCounts(tracked);
    await update({ ...tracked[0], releases: sameDay });
    await assertCounts(tracked);
    await update({ ...tracked[0], releases: sameDay.slice(1) });
    await assertCounts(tracked);
    await update({ ...tracked[0], releases: [] });
    await assertCounts(tracked);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
    const otherPage = await page();
    assert.equal(otherPage.total, 1);
    assert.equal(otherPage.listedEvents, 3);
    assert.equal(otherPage.rumoredEvents, 0);
    await db.exec('reset role;set role anon');
    await assert.rejects(page(), /permission denied/);
  } finally {
    await db.close();
  }
});
