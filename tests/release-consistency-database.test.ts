import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { discoverMovies } from '../lib/catalogue-view';
import { calendarRelease, type Movie, type Release } from '../lib/model';
test('SQL/client ordering, calendar preferences and guarded per-window withdrawals agree', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 alter default privileges in schema public grant all on tables to service_role;
 alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
 grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
    for (const name of (await readdir('supabase/migrations'))
      .filter((n) => n.endsWith('.sql'))
      .sort())
      await db.exec(await readFile('supabase/migrations/' + name, 'utf8'));
    const owner = '11111111-1111-4111-8111-111111111111';
    await db.query('insert into auth.users values($1)', [owner]);
    await db.query('insert into public.a_list_accounts(id,include_rumors) values($1,false)', [
      owner,
    ]);
    const today = (
      await db.query<{ day: string }>(
        "select to_char(now() at time zone 'America/New_York','YYYY-MM-DD') as day",
      )
    ).rows[0].day;
    const day = (n: number) => {
      const d = new Date(today + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    const release = (
      kind: Release['kind'],
      n: number,
      confidence: Release['confidence'] = 'listed',
    ): Release => ({
      kind,
      date: day(n),
      confidence,
      source: 'https://whentostream.com/fixture/',
      sourceName: 'When To Stream',
      filmImdbId: 'tt7000000',
    });
    const films: Movie[] = Array.from({ length: 35 }, (_, i) => ({
      id: String(i + 1),
      imdbId: 'tt7000000',
      identityVerifiedAt: new Date().toISOString(),
      title: `Film ${String(i).padStart(2, '0')}`,
      year: '2026',
      poster: '',
      source: 'https://example.com',
      checkedAt: new Date().toISOString(),
      releases:
        i % 4 === 0
          ? [release('Digital', -20), release('Subscription', 2)]
          : i % 4 === 1
            ? [release('Digital', 5)]
            : i % 4 === 2
              ? [release('Digital', 1, 'rumored')]
              : [],
    }));
    ['Álbum', 'Zulu', 'filipiñana', 'FILIPIÑANA', '東京', '🎬 Film'].forEach((title, index) => {
      films[index].title = title;
    });
    films.reverse();
    for (const film of films) {
      await db.query('insert into public.a_list_movies(id,movie) values($1,$2::jsonb)', [
        film.id,
        JSON.stringify(film),
      ]);
      await db.query(
        'insert into public.a_list_library(user_id,movie_id,movie,tracked) values($1,$2,$3::jsonb,true)',
        [owner, film.id, JSON.stringify(film)],
      );
    }
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    for (const filter of ['all', 'soon', 'available', 'unknown', 'rumored'])
      for (const sort of ['release', 'title', 'theatrical']) {
        const expected = discoverMovies(films, filter, sort, today).map((m) => m.id),
          actual: string[] = [];
        for (let offset = 0; offset < expected.length; offset += 7) {
          const page = (
            await db.query<{ page: { movies: Movie[] } }>(
              'select public.a_list_library_page($1,$2,$3,7,false) as page',
              [sort, filter, offset],
            )
          ).rows[0].page;
          actual.push(...page.movies.map((m) => m.id));
        }
        assert.deepEqual(actual, expected, `${filter}/${sort}`);
      }
    const page = (
      await db.query<{ page: { upcoming: Movie; upcomingRelease: Release } }>(
        'select public.a_list_library_page() as page',
      )
    ).rows[0].page;
    assert.equal(page.upcomingRelease.confidence, 'listed');
    assert.equal(page.upcomingRelease.date, calendarRelease(page.upcoming, false, today)?.date);
    await assert.rejects(
      db.query(
        "select public.a_list_withdraw_release_windows('1','tt7000000','https://whentostream.com/fixture/',array['Subscription'],now())",
      ),
      /permission/,
    );
    await db.exec('reset role;set role service_role');
    const version = (
      await db.query<{ version: string }>(
        "select updated_at::text as version from public.a_list_movies where id='1'",
      )
    ).rows[0].version;
    await assert.rejects(
      db.query(
        "select public.a_list_withdraw_release_windows('1','tt7000000','https://whentostream.com/fixture/',array['Subscription'],'2000-01-01')",
      ),
      /Catalogue changed/,
    );
    await db.query(
      "select public.a_list_withdraw_release_windows('1','tt7000000','https://whentostream.com/fixture/',array['Subscription'],$1::timestamptz)",
      [version],
    );
    const stored = (
      await db.query<{ movie: Movie }>("select movie from public.a_list_movies where id='1'")
    ).rows[0].movie;
    assert.deepEqual(
      stored.releases.map((r) => r.kind),
      ['Digital'],
    );
  } finally {
    await db.close();
  }
});
