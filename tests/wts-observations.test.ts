import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import {
  observationFields,
  observationSnapshot,
  observationSummary,
  requestObservation,
} from '../lib/observations';

test('retained histograms separate visitor, poll and freshness work and reject identifying or invalid fields', () => {
  const request = requestObservation('movie', false, 200, 304);
  const fields = observationFields(
    { ...request.counters, 'user@example.invalid': 1, api_errors: NaN },
    [
      ...request.timings,
      ...requestObservation('movie', true, 200, 90).timings,
      { name: 'lookup_source', durationMs: 1500 },
      { name: 'discovered_to_published', durationMs: 900000 },
      { name: 'visitor_movie', durationMs: Infinity },
      { name: 'visitor_movie', durationMs: -1 },
    ],
  );
  assert.deepEqual(fields, {
    'count:api_requests': 1,
    'time:visitor_movie:5': 1,
    'time:background_detail_poll:2': 1,
    'time:lookup_source:8': 1,
    'time:discovered_to_published:18': 1,
  });
  const parsed = observationSnapshot({
    _generation: '11111111-1111-4111-8111-111111111111',
    _version: '3',
    ...fields,
    'user:private': 44,
    'time:visitor_movie:26': 2,
    'time:visitor_movie:1:private': 3,
    'count:api_requests:': 4,
    'time:visitor_movie:1': [4],
  });
  assert.ok(parsed);
  assert.deepEqual(parsed.fields, fields);
  assert.equal(observationSnapshot({ _generation: 'invalid', _version: 3 }), null);
  const summary = observationSummary([
    parsed,
    { fields: { 'time:visitor_movie:4': 20, 'time:visitor_movie:5': 1 } },
  ]);
  assert.deepEqual(summary.timings.visitor_movie, {
    samples: 22,
    p50UpperMs: 250,
    p95UpperMs: 500,
    overflow: 0,
  });
  assert.equal(summary.timings.background_detail_poll.samples, 1);
  assert.equal(summary.timings.discovered_to_published.p95UpperMs, 1200000);
  assert.deepEqual(requestObservation('movie', false, 503, 2000).timings, []);
  assert.equal(requestObservation('movie', false, 503, 2000).counters.api_errors, 1);
});

test('retention checkpoints are replay-safe across cache generations, private to service and bounded by age', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role bypassrls;alter default privileges in schema public grant all on tables to service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;",
    );
    const dir = new URL('../supabase/migrations/', import.meta.url);
    for (const name of (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort())
      await db.exec(await readFile(new URL(name, dir), 'utf8'));
    await db.exec('set role service_role');
    const save = async (generation: string, version: number, fields: Record<string, unknown>) =>
      (
        await db.query<{ ok: boolean }>(
          "select public.a_list_retain_observations((now() at time zone 'UTC')::date,$1,$2,$3::jsonb) ok",
          [generation, version, JSON.stringify(fields)],
        )
      ).rows[0].ok;
    const generation = '11111111-1111-4111-8111-111111111111';
    assert.equal(
      await save(generation, 2, { 'count:api_requests': 10, 'time:visitor_movie:4': 10 }),
      true,
    );
    assert.equal(await save(generation, 2, { 'count:api_requests': 10 }), false);
    assert.equal(await save(generation, 1, { 'count:api_requests': 1 }), false);
    assert.equal(
      await save(generation, 3, { 'count:api_requests': 12, 'time:visitor_movie:4': 12 }),
      true,
    );
    // Redis loss starts a new generation rather than replacing retained counters.
    assert.equal(
      await save('22222222-2222-4222-8222-222222222222', 1, {
        'count:api_requests': 2,
        'time:visitor_movie:5': 2,
      }),
      true,
    );
    const rows = (
      await db.query<{ fields: Record<string, number> }>(
        'select fields from public.a_list_observation_days',
      )
    ).rows;
    assert.equal(observationSummary(rows).counters.api_requests, 14);
    await assert.rejects(
      save(generation, 4, { 'user:secret@example.invalid': 1 }),
      /Invalid observation field/,
    );
    await assert.rejects(
      save(generation, 4, { 'count:api_requests': -1 }),
      /Invalid observation field/,
    );
    await assert.rejects(
      save(generation, 4, { 'time:visitor_movie:26': 1 }),
      /Invalid observation field/,
    );
    await db.exec(
      "insert into public.a_list_observation_days(day,generation,version,fields) values((now() at time zone 'UTC')::date-50,gen_random_uuid(),1,'{}');insert into public.a_list_wts_health_history values(now()-interval '50 days','{}')",
    );
    await save(generation, 4, { 'count:api_requests': 13 });
    assert.equal(
      (await db.query<{ n: number }>('select count(*)::int n from public.a_list_observation_days'))
        .rows[0].n,
      2,
    );
    assert.equal(
      (await db.query<{ ok: boolean }>('select public.a_list_capture_wts_health() ok')).rows[0].ok,
      true,
    );
    assert.equal(
      (await db.query<{ ok: boolean }>('select public.a_list_capture_wts_health() ok')).rows[0].ok,
      false,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          'select count(*)::int n from public.a_list_wts_health_history',
        )
      ).rows[0].n,
      1,
    );
    const snapshot = (
      await db.query<{ snapshot: Record<string, unknown> }>(
        'select snapshot from public.a_list_wts_health_history',
      )
    ).rows[0].snapshot;
    assert.ok(snapshot.profiles);
    assert.ok(snapshot.queues);
    assert.ok(snapshot.failureSummary);
    for (const role of ['anon', 'authenticated']) {
      await db.exec('reset role;set role ' + role);
      await assert.rejects(
        db.query('select * from public.a_list_observation_days'),
        /permission denied/,
      );
      await assert.rejects(
        db.query('select * from public.a_list_wts_health_history'),
        /permission denied/,
      );
      await assert.rejects(save(generation, 5, { 'count:api_requests': 13 }), /permission denied/);
      await assert.rejects(
        db.query('select public.a_list_capture_wts_health()'),
        /permission denied/,
      );
    }
  } finally {
    await db.close();
  }
});
