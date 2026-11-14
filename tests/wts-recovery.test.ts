import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { PGlite } from '@electric-sql/pglite';
import { makeCalendar } from '../lib/calendar';
import { runWithLease } from '../lib/lease';
import type { Movie } from '../lib/model';
import type { LookupCache, LookupContext, LookupState } from '../lib/release-lookup';
registerHooks({
  resolve(specifier, context, next) {
    return specifier === 'server-only'
      ? {
          url: new URL('../node_modules/next/dist/compiled/server-only/empty.js', import.meta.url)
            .href,
          shortCircuit: true,
        }
      : next(specifier, context);
  },
});
const { lookupReleaseReports } = await import('../lib/release-lookup');
const emptyFeed = `<rss><channel><!--${'.'.repeat(600)}--></channel></rss>`;
const fixedNow = new Date('2026-11-14T00:00:00Z');
function lookupMemory() {
  const values = new Map<string, LookupState>(),
    leases = new Map<string, string>();
  let writeUnavailable = false,
    reads = 0;
  const api: LookupCache = {
    read: async (key) => {
      reads++;
      return values.get(key) || null;
    },
    write: async (key, value) => {
      if (writeUnavailable) throw new Error('Fixture Redis write outage');
      values.set(key, value);
    },
    lease: async (key, _seconds, work) =>
      runWithLease(
        {
          acquire: async (token) => {
            if (leases.has(key)) return false;
            leases.set(key, token);
            return true;
          },
          release: async (token) => {
            if (leases.get(key) === token) leases.delete(key);
          },
        },
        'fixture-lease-owner',
        work,
        () => assert.fail('Fixture lease cleanup failed'),
      ),
  };
  return {
    api,
    values,
    get reads() {
      return reads;
    },
    loseCache: () => values.clear(),
    failWrites: () => {
      writeUnavailable = true;
    },
  };
}
const film = (id: string): Movie => ({
  id,
  imdbId: id,
  title: `Recovery Journey ${id}`,
  year: '2026',
  source: `https://www.imdb.com/title/${id}/`,
  poster: '',
  checkedAt: '2026-11-13T00:00:00Z',
  releases: [
    {
      kind: 'Digital',
      date: '2099-01-01',
      confidence: 'listed',
      source: 'https://whentostream.com/recovery-journey-2026/',
      sourceName: 'When To Stream',
      filmImdbId: id,
      filmIdentityMethod: 'structured',
    },
  ],
});

test('real lookup scheduling survives sustained outages, cache loss, competing workers and later withdrawals', async (t) => {
  const sql = new PGlite(),
    originalFetch = globalThis.fetch;
  const client = createClient('https://recovery.test', 'fixture-only', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const endpoint = new URL(String(input)).pathname.split('/').at(-1);
        const args = JSON.parse(String(init?.body || '{}'));
        let value: unknown;
        if (endpoint === 'a_list_report_lookup_context')
          value = (
            await sql.query<{ value: LookupContext }>(
              'select public.a_list_report_lookup_context($1) value',
              [args.p_id],
            )
          ).rows[0].value;
        else if (endpoint === 'a_list_record_lookup_result')
          value = (
            await sql.query<{ value: boolean }>(
              'select public.a_list_record_lookup_result($1,$2,$3,$4::jsonb,$5,$6,$7,$8::text[]) value',
              [
                args.p_id,
                args.p_after,
                args.p_outcome,
                JSON.stringify(args.p_diagnostic),
                args.p_attempted,
                args.p_expected_version,
                args.p_source_failure,
                args.p_known_kinds,
              ],
            )
          ).rows[0].value;
        else throw new Error(`Unexpected fixture database endpoint ${endpoint}`);
        return Response.json(value);
      },
    },
  });
  const stored = async (id: string) =>
    (
      await sql.query<{
        movie: Movie;
        report_lookup_failures: number;
        report_lookup_version: number;
        report_lookup_after: Date;
        report_lookup_outcome: string;
      }>(
        'select movie,report_lookup_failures,report_lookup_version,report_lookup_after,report_lookup_outcome from public.a_list_movies where id=$1',
        [id],
      )
    ).rows[0];
  const insert = async (movie: Movie) =>
    sql.query(
      "insert into public.a_list_movies(id,movie,report_lookup_after) values($1,$2::jsonb,now()-interval '1 second')",
      [movie.id, JSON.stringify(movie)],
    );
  const due = async (id: string) =>
    sql.query(
      "update public.a_list_movies set report_lookup_after=now()-interval '1 second' where id=$1",
      [id],
    );
  const lookup = (movie: Movie, memory: ReturnType<typeof lookupMemory>) =>
    lookupReleaseReports(movie, {
      db: client,
      lookupCache: memory.api,
      signal: AbortSignal.timeout(5000),
    });
  try {
    await sql.exec(
      "create role anon;create role authenticated;create role service_role bypassrls;alter default privileges in schema public grant all on tables to service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;",
    );
    const migrations = new URL('../supabase/migrations/', import.meta.url);
    for (const name of (await readdir(migrations)).filter((name) => name.endsWith('.sql')).sort())
      await sql.exec(await readFile(new URL(name, migrations), 'utf8'));
    await sql.exec('set role service_role');
    await t.test(
      'two outages retain dates and increase durable backoff; cache loss cannot trigger extra work and Redis write failure cannot discard recovery',
      async () => {
        const movie = film('tt7100001'),
          memory = lookupMemory();
        await insert(movie);
        let requests = 0,
          available = false;
        globalThis.fetch = async (input) => {
          assert.match(String(input), /^https:\/\/whentostream\.com\/feed\//);
          requests++;
          return available ? new Response(emptyFeed) : new Response('Unavailable', { status: 503 });
        };
        const calendar = makeCalendar([movie], { now: fixedNow });
        const first = await lookup(movie, memory);
        assert.equal(first.outcome, 'source_unavailable');
        assert.equal(first.persisted, true);
        assert.deepEqual(first.movie.releases, movie.releases);
        let row = await stored(movie.id);
        assert.equal(row.report_lookup_failures, 1);
        assert.ok(row.report_lookup_after.getTime() - Date.now() > 590000);
        memory.loseCache();
        assert.equal((await lookup(row.movie, memory)).attempted, false);
        assert.equal(requests, 1, 'Durable scheduling survives an empty Redis cache');
        await due(movie.id);
        const second = await lookup(row.movie, memory);
        assert.equal(second.outcome, 'source_unavailable');
        row = await stored(movie.id);
        assert.equal(row.report_lookup_failures, 2);
        assert.ok(row.report_lookup_after.getTime() - Date.now() > 1190000);
        assert.equal(
          makeCalendar([row.movie], { now: fixedNow }),
          calendar,
          'Repeated outages preserve the exact calendar',
        );
        const unrelated = film('tt7100002');
        await insert(unrelated);
        available = true;
        assert.equal((await lookup(unrelated, lookupMemory())).outcome, 'no_report');
        assert.equal(
          (await stored(movie.id)).report_lookup_failures,
          2,
          'Another film recovering cannot clear this film’s incident',
        );
        await due(movie.id);
        memory.loseCache();
        memory.failWrites();
        const recovered = await lookup(row.movie, memory);
        assert.equal(recovered.outcome, 'no_report');
        assert.equal(recovered.persisted, true);
        row = await stored(movie.id);
        assert.equal(row.report_lookup_failures, 0);
        assert.equal(row.report_lookup_outcome, 'no_report');
        assert.equal(makeCalendar([row.movie], { now: fixedNow }), calendar);
        assert.equal(recovered.movie.releaseLookupStatus, undefined);
      },
    );
    await t.test(
      'a lease loser cannot supersede the active worker’s durable failure checkpoint',
      async () => {
        const movie = film('tt7100003'),
          memory = lookupMemory();
        await insert(movie);
        let enter!: () => void, release!: () => void;
        const entered = new Promise<void>((resolve) => {
            enter = resolve;
          }),
          held = new Promise<void>((resolve) => {
            release = resolve;
          });
        let requests = 0;
        globalThis.fetch = async () => {
          requests++;
          enter();
          await held;
          return new Response('Unavailable', { status: 503 });
        };
        const active = lookup(movie, memory);
        await entered;
        try {
          const loser = await lookup(movie, memory);
          assert.equal(loser.outcome, 'busy');
          assert.equal(loser.attempted, false);
          assert.equal(
            (await stored(movie.id)).report_lookup_version,
            0,
            'Only the worker performing a check may advance its outcome version',
          );
        } finally {
          release();
        }
        const result = await active;
        assert.equal(result.outcome, 'source_unavailable');
        assert.equal(result.persisted, true);
        assert.equal(requests, 1);
        const row = await stored(movie.id);
        assert.equal(row.report_lookup_failures, 1);
        assert.ok(row.report_lookup_after.getTime() - Date.now() > 590000);
      },
    );
    await t.test(
      'a cache observer cannot supersede the completed check while its durable checkpoint is pending',
      async () => {
        const movie = film('tt7100005'),
          memory = lookupMemory();
        await insert(movie);
        let enter!: () => void, release!: () => void;
        const entered = new Promise<void>((resolve) => {
            enter = resolve;
          }),
          held = new Promise<void>((resolve) => {
            release = resolve;
          });
        const pausedWrite = {
          ...memory,
          api: {
            ...memory.api,
            write: async (...args: Parameters<LookupCache['write']>) => {
              await memory.api.write(...args);
              enter();
              await held;
            },
          },
        };
        let requests = 0;
        globalThis.fetch = async () => {
          requests++;
          return new Response('Unavailable', { status: 503 });
        };
        const active = lookup(movie, pausedWrite);
        await entered;
        let observed, version;
        try {
          observed = await lookup(movie, memory);
          version = (await stored(movie.id)).report_lookup_version;
        } finally {
          release();
        }
        const result = await active;
        assert.equal(observed?.outcome, 'cached');
        assert.equal(observed?.attempted, false);
        assert.equal(
          observed?.persisted,
          true,
          'Cached work may defer another sweep without taking the active version',
        );
        assert.equal(version, 0, 'Redis visibility does not transfer durable checkpoint ownership');
        assert.equal(result.outcome, 'source_unavailable');
        assert.equal(result.persisted, true);
        assert.equal(requests, 1);
        const row = await stored(movie.id);
        assert.equal(row.report_lookup_failures, 1);
        assert.equal(row.report_lookup_outcome, 'source_unavailable');
        const late = await client.rpc('a_list_record_lookup_result', {
          p_id: movie.id,
          p_after: new Date(Date.now() + 7 * 86400000).toISOString(),
          p_outcome: 'cached',
          p_diagnostic: {},
          p_attempted: false,
          p_expected_version: 0,
          p_source_failure: false,
          p_known_kinds: [],
        });
        assert.equal(late.data, false);
        assert.equal(
          (await stored(movie.id)).report_lookup_after.getTime(),
          row.report_lookup_after.getTime(),
          'A late cached deferral cannot postpone the actual retry',
        );
      },
    );
    await t.test(
      'an orphaned Redis result can leave the due queue without changing durable source evidence',
      async () => {
        const movie = film('tt7100006'),
          memory = lookupMemory();
        await insert(movie);
        memory.values.set(`release-lookup:v14:${movie.id}:unindexed:public`, {
          outcome: 'no_report',
          nextCheckAt: new Date(Date.now() + 86400000).toISOString(),
          knownKinds: ['Digital'],
        });
        globalThis.fetch = async () => {
          assert.fail('An unexpired cached result must not refetch a provider');
        };
        assert.equal((await lookup(movie, memory)).outcome, 'cached');
        const row = await stored(movie.id);
        assert.equal(row.report_lookup_version, 0);
        assert.equal(row.report_lookup_failures, 0);
        assert.equal(
          row.report_lookup_outcome,
          null,
          'Cache observations do not manufacture source checks',
        );
        assert.ok(row.report_lookup_after.getTime() > Date.now());
        const dueIds = (
          await sql.query<{ id: string }>(
            'select id from public.a_list_report_lookup_candidates(1000)',
          )
        ).rows.map((row) => row.id);
        assert.ok(
          !dueIds.includes(movie.id),
          'Cached films must not occupy the front of every bounded sweep',
        );
        const reads = memory.reads;
        for (let i = 0; i < 3; i++) assert.equal((await lookup(movie, memory)).attempted, false);
        assert.equal(memory.reads, reads, 'Durable deferral avoids repeated Redis reads too');
      },
    );
    await t.test(
      'a fresh publication defeats an older failed worker and a later withdrawal defeats its cached negative',
      async () => {
        const movie = film('tt7100004'),
          memory = lookupMemory();
        await insert(movie);
        let enter!: () => void, release!: () => void;
        const entered = new Promise<void>((resolve) => {
            enter = resolve;
          }),
          held = new Promise<void>((resolve) => {
            release = resolve;
          });
        globalThis.fetch = async () => {
          enter();
          await held;
          return new Response('Unavailable', { status: 503 });
        };
        const stale = lookup(movie, memory);
        await entered;
        const published = {
          ...movie,
          releases: [
            ...movie.releases,
            {
              ...movie.releases[0],
              kind: 'Subscription' as const,
              date: '2099-02-01',
              platform: 'Netflix',
            },
          ],
        };
        await sql.query('update public.a_list_movies set movie=$2::jsonb where id=$1', [
          movie.id,
          JSON.stringify(published),
        ]);
        release();
        assert.equal(
          (await stale).persisted,
          false,
          'A stale error cannot erase a newer complete publication',
        );
        let row = await stored(movie.id);
        assert.equal(row.report_lookup_failures, 0);
        assert.equal(row.report_lookup_outcome, 'ineligible');
        assert.equal(row.movie.releases.length, 2);
        const withdrawn = { ...published, releases: [] };
        await sql.query('update public.a_list_movies set movie=$2::jsonb where id=$1', [
          movie.id,
          JSON.stringify(withdrawn),
        ]);
        let requests = 0;
        globalThis.fetch = async () => {
          requests++;
          return new Response(emptyFeed);
        };
        const result = await lookup(withdrawn, memory);
        assert.equal(result.attempted, true);
        assert.equal(
          requests,
          1,
          'Withdrawn known kinds invalidate both durable and cached postponement',
        );
        row = await stored(movie.id);
        assert.deepEqual(row.movie.releases, []);
        assert.doesNotMatch(makeCalendar([row.movie], { now: fixedNow }), /BEGIN:VEVENT/);
        const history = (
          await sql.query<{ value: { reason: string }[] }>(
            'select public.a_list_release_history_page($1) value',
            [movie.id],
          )
        ).rows[0].value;
        assert.equal(history[0].reason, 'withdrawn');
        const series = { ...withdrawn, mediaType: 'series' as const, releases: movie.releases };
        await sql.query('update public.a_list_movies set movie=$2::jsonb where id=$1', [
          movie.id,
          JSON.stringify(series),
        ]);
        assert.equal((await lookup(series, memory)).outcome, 'ineligible');
        assert.equal(requests, 1);
        assert.doesNotMatch(
          makeCalendar([series], { now: fixedNow }),
          /BEGIN:VEVENT/,
          'Legacy dates cannot enter a series calendar',
        );
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    await sql.close();
  }
});
