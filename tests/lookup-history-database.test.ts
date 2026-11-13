import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
test('lookup outcomes are guarded across aliases, failures survive other successes, and date history is bounded and read-only', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;alter default privileges in schema public grant all on tables to service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
    );
    const dir = new URL('../supabase/migrations/', import.meta.url);
    for (const name of (await readdir(dir)).filter((n) => n.endsWith('.sql')).sort())
      await db.exec(await readFile(new URL(name, dir), 'utf8'));
    const release = {
      kind: 'Digital',
      date: '2099-01-01',
      confidence: 'listed',
      source: 'https://www.dvdsreleasedates.com/movies/123/a-film',
      sourceName: 'DVDs Release Dates',
      checkedAt: '2026-11-13T00:00:00Z',
    };
    const movie = {
      id: '123',
      imdbId: 'tt7777777',
      identityVerifiedAt: '2026-11-13T00:00:00Z',
      title: 'A Film',
      year: '2026',
      poster: '',
      source: release.source,
      releases: [release],
      checkedAt: '2026-11-13T00:00:00Z',
    };
    await db.exec('set role service_role');
    for (const row of [
      movie,
      { ...movie, id: movie.imdbId, source: `https://www.imdb.com/title/${movie.imdbId}/` },
      {
        ...movie,
        id: '456',
        imdbId: 'tt8888888',
        source: 'https://www.dvdsreleasedates.com/movies/456/other',
      },
    ])
      await db.query('insert into public.a_list_movies(id,movie) values($1,$2::jsonb)', [
        row.id,
        JSON.stringify(row),
      ]);
    const checkpoint = async (
      id: string,
      version: number,
      outcome = 'source_unavailable',
      attempted = true,
    ) =>
      (
        await db.query<{ ok: boolean }>(
          'select public.a_list_record_lookup_result($1,now()+interval \'1 hour\',$2,\'{"stage":"profile","category":"format_changed"}\'::jsonb,$3,$4,$5,array[\'Digital\']) ok',
          [id, outcome, attempted, version, outcome === 'source_unavailable'],
        )
      ).rows[0].ok;
    const context = async () =>
      (
        await db.query<{ v: { lookupVersion: number; failures: number; outcome: string } }>(
          'select public.a_list_report_lookup_context($1) v',
          [movie.imdbId],
        )
      ).rows[0].v;
    assert.equal(await checkpoint('123', 0), true);
    assert.equal((await context()).failures, 1);
    assert.equal(await checkpoint('456', 0, 'no_report'), true);
    assert.equal((await context()).failures, 1);
    assert.equal(
      (
        await db.query<{ v: { failureSummary: { lookupUnavailable: number } } }>(
          'select public.a_list_queue_health() v',
        )
      ).rows[0].v.failureSummary.lookupUnavailable,
      1,
      'IMDb aliases represent one failed film',
    );
    assert.equal(
      await checkpoint('123', 0, 'matched'),
      false,
      'Old result cannot erase newer failure',
    );
    assert.equal(await checkpoint('123', 1, 'cached', false), true);
    assert.equal((await context()).failures, 1, 'Cached results preserve failure evidence');
    assert.equal(await checkpoint('123', 2, 'no_report'), true);
    assert.equal((await context()).failures, 0);
    const history = async () =>
      (
        await db.query<{
          v: {
            previous: { date: string } | null;
            current: { date: string } | null;
            reason: string;
          }[];
        }>('select public.a_list_release_history_page($1) v', ['123'])
      ).rows[0].v;
    assert.equal((await history()).length, 1);
    await db.query(
      "update public.a_list_movies set movie=jsonb_set(movie,'{releases,0,checkedAt}','\"2026-11-14T00:00:00Z\"') where id='123'",
    );
    assert.equal((await history()).length, 1, 'Verification-only writes do not grow history');
    await db.query(
      "update public.a_list_movies set movie=jsonb_set(movie,'{releases,0,date}','\"2099-01-02\"') where id='123'",
    );
    assert.equal((await history())[0].previous?.date, '2099-01-01');
    assert.equal((await history())[0].current?.date, '2099-01-02');
    assert.equal((await history())[0].reason, 'date_changed');
    await db.query(
      "update public.a_list_movies set movie=jsonb_set(movie,'{releases}','[]') where id='123'",
    );
    assert.equal((await history())[0].reason, 'withdrawn');
    await db.query("update public.a_list_movies set movie=$1::jsonb where id='123'", [
      JSON.stringify(movie),
    ]);
    for (let i = 0; i < 55; i++)
      await db.query(
        "update public.a_list_movies set movie=jsonb_set(movie,'{releases,0,date}',to_jsonb(($1::date+$2::integer)::text)) where id='123'",
        ['2099-02-01', i],
      );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from public.a_list_release_history where movie_id='123'",
        )
      ).rows[0].n,
      50,
    );
    assert.equal((await history()).length, 12);
    await db.exec(
      "update public.a_list_release_history set changed_at=now()-interval '181 days' where movie_id='123'",
    );
    await db.query(
      "update public.a_list_movies set movie=jsonb_set(movie,'{releases,0,date}','\"2099-10-01\"') where id='123'",
    );
    assert.equal((await history()).length, 1);
    await db.query(
      "update public.a_list_movies set movie=jsonb_set(movie,'{mediaType}','\"series\"') where id='123'",
    );
    assert.deepEqual(
      (
        await db.query<{ v: { releases: unknown[] } }>(
          "select a_list_private.verified_movie(movie) v from public.a_list_movies where id='123'",
        )
      ).rows[0].v.releases,
      [],
    );
    assert.deepEqual(await history(), [], 'TV subjects have no movie history surface');
    await db.exec('reset role;set role authenticated');
    await db.query("select public.a_list_release_history_page('456')");
    await assert.rejects(
      db.query(
        "insert into public.a_list_release_history(movie_id,kind,reason) values('456','Digital','listed')",
      ),
      /permission denied/,
    );
    await assert.rejects(checkpoint('456', 1), /permission denied/);
    await db.exec('reset role;set role anon');
    await assert.rejects(history(), /permission denied/);
  } finally {
    await db.close();
  }
});
