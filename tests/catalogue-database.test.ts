import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { Movie } from '../lib/model';
import { makeCalendar, CALENDAR_FORMAT_UPDATED_AT } from '../lib/calendar';
import { feedDocument } from '../lib/feed-cache';

test('catalogue publication preserves concurrent edits and inserts in rows, snapshots and returned cache data', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
   alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
   create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
   grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
    const migrations = new URL('../supabase/migrations/', import.meta.url);
    for (const name of (await readdir(migrations)).filter((name) => name.endsWith('.sql')).sort())
      await db.exec(await readFile(new URL(name, migrations), 'utf8'));
    const film = (id: string): Movie => ({
      id,
      title: `Film ${id}`,
      year: '2026',
      poster: '',
      source: `https://www.dvdsreleasedates.com/movies/${id}/film`,
      checkedAt: '2026-10-25T00:00:00Z',
      releases: [],
    });
    const original = film('1'),
      unchanged = film('2'),
      newFilm = film('3'),
      racingInsert = film('4');
    const publish = async (
      movies: Movie[],
      versions: Record<string, string | null>,
      stamp = '2026-10-25T02:00:00Z',
    ) =>
      (
        await db.query<{ movies: Movie[] }>(
          'select public.a_list_publish_catalogue_versioned($1::jsonb,$2::timestamptz,$3::jsonb) as movies',
          [JSON.stringify(movies), stamp, JSON.stringify(versions)],
        )
      ).rows[0].movies;
    const row = async (id: string) =>
      (
        await db.query<{ movie: Movie; version: string }>(
          'select movie,updated_at::text as version from public.a_list_movies where id=$1',
          [id],
        )
      ).rows[0];
    await db.exec('set role anon');
    await assert.rejects(publish([], {}), /permission denied/);
    await db.exec('reset role;set role authenticated');
    await assert.rejects(publish([], {}), /permission denied/);
    await db.exec('reset role;set role service_role');
    await publish([original, unchanged], { '1': null, '2': null }, '2026-10-25T00:00:00Z');
    const versions = {
      '1': (await row('1')).version,
      '2': (await row('2')).version,
      '3': null,
      '4': null,
    };
    const fresh = {
      ...original,
      overview: 'New synopsis from the detail request',
      releases: [
        {
          kind: 'Digital' as const,
          date: '2026-11-04',
          confidence: 'listed' as const,
          source: original.source,
          sourceName: 'DVDs Release Dates',
        },
      ],
    };
    await db.query('update public.a_list_movies set movie=$1::jsonb,updated_at=$2 where id=$3', [
      JSON.stringify(fresh),
      '2026-10-25T01:00:00Z',
      '1',
    ]);
    const inserted = { ...racingInsert, overview: 'Inserted by a concurrent search' };
    await publish([inserted], { '4': null }, '2026-10-25T01:00:00Z');
    const candidate = { ...unchanged, overview: 'Catalogue enrichment' };
    const result = await publish([original, candidate, newFilm, racingInsert], versions);
    assert.deepEqual(result, [fresh, candidate, newFilm, inserted]);
    for (const movie of result) assert.deepEqual((await row(movie.id)).movie, movie);
    assert.equal((await row('1')).version, '2026-10-25 01:00:00+00');
    const snapshot = (
      await db.query<{ catalogue: Movie[] }>('select catalogue from public.a_list_source_status')
    ).rows[0].catalogue;
    assert.deepEqual(snapshot, result);
    // The old application can run during rollout without restoring stale data.
    await db.query('select public.a_list_publish_catalogue($1::jsonb,$2::timestamptz)', [
      JSON.stringify([original]),
      '2026-10-25T03:00:00Z',
    ]);
    assert.deepEqual((await row('1')).movie, fresh);
    await assert.rejects(publish([film('5')], {}), /versions required/);
    assert.equal(
      (await db.query<{ count: number }>('select count(*)::int as count from public.a_list_movies'))
        .rows[0].count,
      4,
    );

    const owner = '11111111-1111-4111-8111-111111111111';
    await db.exec('reset role');
    await db.query('insert into auth.users(id) values($1)', [owner]);
    await db.query('insert into public.a_list_accounts(id) values($1)', [owner]);
    await db.query(
      'insert into public.a_list_library(user_id,movie_id,movie) values($1,$2,$3::jsonb)',
      [owner, '2', JSON.stringify(candidate)],
    );
    await db.query("update public.a_list_movies set refresh_after=now()-interval '1 hour'");
    // An older one-off request must not get ahead of a saved film.
    await db.query(
      "update public.a_list_movies set requested_at=now(),refresh_after=now()-interval '2 hours' where id='1'",
    );
    await db.exec('set role service_role');
    const due = (
      await db.query<{ id: string }>('select id from public.a_list_refresh_candidates(8)')
    ).rows.map((row) => row.id);
    assert.deepEqual(due, ['2', '1']);
    assert.deepEqual(
      (
        await db.query<{ id: string }>('select id from public.a_list_refresh_candidates(1)')
      ).rows.map((row) => row.id),
      ['2'],
    );
    await db.exec('reset role;set role authenticated');
    await assert.rejects(
      db.query('select * from public.a_list_refresh_candidates(8)'),
      /permission denied/,
    );

    await db.exec('reset role');
    const dated = { ...candidate, releases: fresh.releases };
    await db.query('update public.a_list_movies set movie=$1::jsonb where id=$2', [
      JSON.stringify(dated),
      '2',
    ]);
    const token = (
      await db.query<{ feed_token: string }>(
        'select feed_token from public.a_list_accounts where id=$1',
        [owner],
      )
    ).rows[0].feed_token;
    type State = { sourcesVersion: string; modifiedAt: string };
    const calendar = async () => {
      await db.exec('set role anon');
      const state = (
        await db.query<{ state: State }>('select public.a_list_calendar_state($1) as state', [
          token,
        ])
      ).rows[0].state;
      const feed = (
        await db.query<{ feed: { movies: Movie[] } }>(
          'select public.a_list_calendar_feed($1) as feed',
          [token],
        )
      ).rows[0].feed;
      await db.exec('reset role');
      const modified = new Date(
        Math.max(Date.parse(state.modifiedAt), Date.parse(CALENDAR_FORMAT_UPDATED_AT)),
      ).toISOString();
      return {
        state,
        document: feedDocument(makeCalendar(feed.movies, { now: new Date(modified) }), modified),
      };
    };
    const before = await calendar();
    await publish([dated], { '2': (await row('2')).version });
    assert.deepEqual(
      await calendar(),
      before,
      'An identical publication must keep the calendar stable',
    );
    const checkedAgain = {
      ...dated,
      checkedAt: '2026-10-26T12:00:00Z',
      overview: 'Rechecked synopsis',
      poster: 'https://example.com/new-poster.jpg',
    };
    await publish([checkedAgain], { '2': (await row('2')).version });
    assert.deepEqual(
      await calendar(),
      before,
      'Source checks, posters and synopses must not invalidate feeds',
    );
    const changed = { ...checkedAgain, releases: [{ ...dated.releases[0], date: '2026-11-05' }] };
    await publish([changed], { '2': (await row('2')).version });
    const after = await calendar();
    assert.notEqual(after.state.sourcesVersion, before.state.sourcesVersion);
    assert.notEqual(after.document.etag, before.document.etag);
    assert.match(after.document.body, /TRIGGER;VALUE=DATE-TIME:20261105T130000Z/);
    assert.match(after.document.body, /LAST-MODIFIED:\d{8}T\d{6}Z/);
  } finally {
    await db.close();
  }
});
