import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { sanitizeMovie, type Movie, type Release } from '../lib/model';

test('database identity migration keeps filters, counts, pagination and account isolation consistent', async () => {
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
    for (const file of (await readdir(migrations)).filter((file) => file.endsWith('.sql')).sort())
      await db.exec(await readFile(new URL(file, migrations), 'utf8'));
    const checkedAt = '2026-10-24T12:00:00Z',
      imdbId = 'tt1111111';
    const release: Release = {
      kind: 'Subscription',
      date: '2099-11-03',
      confidence: 'listed',
      source: 'https://whentostream.com/a-film/',
      sourceName: 'When To Stream',
      filmImdbId: imdbId,
    };
    const film: Movie = {
      id: '1',
      imdbId,
      identityVerifiedAt: checkedAt,
      title: 'A film',
      year: '2026',
      source: 'https://www.dvdsreleasedates.com/movies/1/a-film',
      poster: '',
      checkedAt,
      releases: [release],
    };
    const variants = [
      film,
      { ...film, identityVerifiedAt: undefined },
      { ...film, identityVerifiedAt: 'invalid' },
      { ...film, identityVerifiedAt: 'infinity' },
      { ...film, imdbId: 'invalid' },
      { ...film, releases: [{ ...release, filmImdbId: 'tt2222222' }] },
      { ...film, id: imdbId, imdbId: undefined, identityVerifiedAt: undefined },
      { ...film, id: imdbId, imdbId: 'tt2222222' },
    ];
    for (const movie of variants) {
      const result = await db.query<{ movie: Movie }>(
        'select a_list_private.verified_movie($1::jsonb) as movie',
        [JSON.stringify(movie)],
      );
      assert.deepEqual(result.rows[0].movie.releases, sanitizeMovie(movie).releases);
    }
    const owner = '11111111-1111-4111-8111-111111111111',
      other = '22222222-2222-4222-8222-222222222222';
    const movies: Movie[] = [
      {
        ...film,
        id: '1',
        title: 'Primary',
        releases: [
          { ...release, sourceName: 'DVDs Release Dates', kind: 'Digital', date: '2000-01-01' },
        ],
      },
      { ...film, id: '2', title: 'Verified report' },
      { ...film, id: '3', title: 'Legacy report', identityVerifiedAt: undefined },
      {
        ...film,
        id: '4',
        title: 'Wrong subject',
        releases: [{ ...release, filmImdbId: 'tt2222222' }],
      },
      { ...film, id: '5', title: 'Rumor', releases: [{ ...release, confidence: 'rumored' }] },
      { ...film, id: '6', title: 'Other account' },
    ];
    for (const id of [owner, other]) {
      await db.query('insert into auth.users(id) values($1)', [id]);
      await db.query('insert into public.a_list_accounts(id) values($1)', [id]);
    }
    for (const movie of movies) {
      await db.query('insert into public.a_list_movies(id,movie) values($1,$2::jsonb)', [
        movie.id,
        JSON.stringify(movie),
      ]);
      await db.query(
        'insert into public.a_list_library(user_id,movie_id,movie) values($1,$2,$3::jsonb)',
        [movie.id === '6' ? other : owner, movie.id, JSON.stringify(movie)],
      );
    }
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    type Page = {
      movies: Movie[];
      total: number;
      filteredTotal: number;
      knownCount: number;
      listedEvents: number;
      rumoredEvents: number;
    };
    const page = async (filter = 'all', offset = 0, limit = 25) => {
      const result = await db.query<{ page: Page }>(
        'select public.a_list_library_page($1,$2,$3,$4,false) as page',
        ['title', filter, offset, limit],
      );
      return result.rows[0].page;
    };
    const all = await page();
    assert.equal(all.total, 5);
    assert.equal(all.knownCount, 3);
    assert.equal(all.listedEvents, 2);
    assert.equal(all.rumoredEvents, 1);
    assert.deepEqual(
      (await page('available')).movies.map((m) => m.id),
      ['1'],
    );
    assert.deepEqual((await page('unknown')).movies.map((m) => m.id).sort(), ['3', '4']);
    assert.deepEqual((await page('soon')).movies.map((m) => m.id).sort(), ['2', '5']);
    assert.deepEqual(
      (await page('rumored')).movies.map((m) => m.id),
      ['5'],
    );
    assert.equal((await page('all', 0, 2)).movies.length, 2);
    assert.equal((await page('all', 2, 2)).movies.length, 2);
    assert.equal((await page('all', 4, 2)).movies.length, 1);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
    assert.equal((await page()).total, 1);
    assert.equal((await page()).movies[0].id, '6');
    await db.exec('reset role; set role anon');
    await assert.rejects(page(), /permission denied/);
  } finally {
    await db.close();
  }
});
