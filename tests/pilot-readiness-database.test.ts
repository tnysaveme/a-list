import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('no-date identities, alias cadence, compact revisions and diagnostics remain service scoped', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      alter default privileges in schema public grant all on tables to service_role;
      create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
      grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
    const dir = new URL('../supabase/migrations/', import.meta.url);
    for (const name of (await readdir(dir)).filter((n) => n.endsWith('.sql')).sort())
      await db.exec(await readFile(new URL(name, dir), 'utf8'));
    const movie = {
      id: 'tt7777777',
      imdbId: 'tt7777777',
      title: 'A Film',
      year: '2020',
      source: 'https://www.imdb.com/title/tt7777777/',
      poster: '',
      releases: [],
      overview: 'Long private-to-details synopsis',
      saved: true,
      tracked: true,
    };
    for (const value of [
      movie,
      {
        ...movie,
        id: '123',
        source: 'https://www.dvdsreleasedates.com/movies/123/a-film',
        identityVerifiedAt: '2026-11-01T00:00:00Z',
      },
    ])
      await db.query('insert into public.a_list_movies(id,movie) values($1,$2::jsonb)', [
        value.id,
        JSON.stringify(value),
      ]);
    await db.query('update public.a_list_source_status set catalogue=$1::jsonb where id', [
      JSON.stringify([movie]),
    ]);
    const revision = async () =>
      (
        await db.query<{ catalogue_version: string }>(
          'select catalogue_version from public.a_list_source_status',
        )
      ).rows[0].catalogue_version;
    const before = await revision();
    await db.exec(
      `update public.a_list_movies set movie=jsonb_set(movie,'{overview}','"Changed synopsis"') where id='tt7777777'`,
    );
    assert.equal(await revision(), before, 'detail-only changes do not invalidate cards');
    await db.exec(
      `update public.a_list_movies set movie=jsonb_set(movie,'{title}','"Corrected Title"') where id='tt7777777'`,
    );
    assert.notEqual(
      await revision(),
      before,
      'canonical writes invalidate even if Redis deletion is missed',
    );
    const match = {
      source_id: '7001',
      profile: {
        sourceFilmId: '7001',
        sourceFilmUrl: 'https://whentostream.com/a-film-2020/',
        title: 'A Film',
        year: '2020',
      },
      fingerprint: 'a'.repeat(64),
      imdb_id: movie.id,
      method: 'corroborated',
      rule_version: 8,
      rationale: 'Verified credits',
    };
    await db.exec('set role service_role');
    await db.query('select public.a_list_store_release_identity($1::jsonb,$2)', [
      JSON.stringify(match),
      '123',
    ]);
    const row = (
      await db.query<{
        approved_imdb_id: string;
        reports: unknown[];
        status: string;
        reviewed_fingerprint: string;
      }>('select * from public.a_list_release_candidates')
    ).rows[0];
    assert.equal(row.approved_imdb_id, movie.id);
    assert.equal(row.status, 'approved');
    assert.equal(row.reviewed_fingerprint, match.fingerprint);
    assert.deepEqual(row.reports, []);
    await assert.rejects(
      db.query('select public.a_list_store_release_identity($1::jsonb,null)', [
        JSON.stringify({ ...match, imdb_id: 'tt8888888' }),
      ]),
      /Conflicting/,
    );
    await db.query(
      "select public.a_list_checkpoint_report_lookup($1,now()+interval '7 days',true)",
      ['123'],
    );
    assert.deepEqual(
      (
        await db.query<{ report_lookup_misses: number }>(
          'select report_lookup_misses from public.a_list_movies',
        )
      ).rows.map((r) => r.report_lookup_misses),
      [1, 1],
    );
    await db.query(
      "select public.a_list_checkpoint_report_lookup($1,now()+interval '7 days',null)",
      ['123'],
    );
    assert.equal(
      (
        await db.query<{ v: { misses: number } }>(
          'select public.a_list_report_lookup_context($1) as v',
          [movie.id],
        )
      ).rows[0].v.misses,
      1,
    );
    await db.query('select public.a_list_queue_wts_profiles($1::jsonb)', [
      JSON.stringify([
        {
          source_id: '7001',
          source: match.profile.sourceFilmUrl,
          title: 'A Film',
          film_year: '2020',
          modified_at: '2026-11-01T00:00:00Z',
        },
      ]),
    ]);
    await db.exec(
      `update public.a_list_wts_profiles set modified_at='2026-11-02T00:00:00Z',diagnostic='{"stage":"profile","category":"http_error","status":503}',checked_at=now()`,
    );
    const context = (
      await db.query<{ v: { misses: number; profiles: unknown[]; revision: string } }>(
        'select public.a_list_report_lookup_context($1) as v',
        [movie.id],
      )
    ).rows[0].v;
    assert.equal(context.misses, 0);
    assert.equal(context.profiles.length, 1);
    assert.ok(context.revision);
    const health = (
      await db.query<{ v: { lookups: { due: number }; recentDiagnostics: unknown[] } }>(
        'select public.a_list_queue_health() as v',
      )
    ).rows[0].v;
    assert.equal(health.lookups.due, 2);
    assert.equal(health.recentDiagnostics.length, 1);
    await db.exec('reset role;set role authenticated');
    const compact = (
      await db.query<{ v: { movies: Record<string, unknown>[] } }>(
        'select public.a_list_catalogue_snapshot() as v',
      )
    ).rows[0].v.movies[0];
    assert.equal(compact.title, 'Corrected Title');
    assert.equal(compact.overview, undefined);
    assert.equal(compact.saved, undefined);
    assert.equal(compact.tracked, undefined);
    for (const query of [
      "select public.a_list_store_release_identity('{}'::jsonb,null)",
      "select public.a_list_report_lookup_context('tt7777777')",
      'select public.a_list_queue_health()',
    ])
      await assert.rejects(db.query(query), /permission denied/);
    await db.exec('reset role;set role anon');
    await assert.rejects(
      db.query('select public.a_list_catalogue_snapshot()'),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
