import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { adminDb } from '../lib/supabase/admin';
import { reconcileReleaseDates } from '../lib/release-reconciliation';
import type { Movie, Release } from '../lib/model';
registerHooks({
  resolve(s, c, next) {
    return s === 'server-only'
      ? {
          url: new URL('../node_modules/next/dist/compiled/server-only/empty.js', import.meta.url)
            .href,
          shortCircuit: true,
        }
      : next(s, c);
  },
});
const {
  parseProfileIndex,
  indexWtsProfiles,
  indexWtsProfileChanges,
  checkpointWtsProfiles,
  inventoryEntries,
} = await import('../lib/wts-inventory');
const page = {
  id: 123,
  link: 'https://whentostream.com/a-film-2026/',
  title: { rendered: 'A Film (2026)' },
  modified_gmt: '2026-10-27T12:00:00',
};
const row = parseProfileIndex([page])[0];
function fakeDb() {
  const writes: {
      table: string;
      value: Record<string, unknown>;
      filters: Record<string, unknown>;
    }[] = [],
    calls: string[] = [],
    queued: unknown[] = [];
  return {
    writes,
    calls,
    queued,
    db: {
      rpc(name: string, args?: { p_profiles?: unknown }) {
        calls.push(name);
        if (args?.p_profiles) queued.push(args.p_profiles);
        return { abortSignal: async () => ({ data: null, error: null }) };
      },
      from(table: string) {
        const filters: Record<string, unknown> = {};
        let value: Record<string, unknown> = {};
        const q = {
          update(v: Record<string, unknown>) {
            value = v;
            return q;
          },
          eq(k: string, v: unknown) {
            filters[k] = v;
            return q;
          },
          abortSignal: async () => {
            writes.push({ table, value, filters });
            return { data: null, error: null };
          },
        };
        return q;
      },
    } as unknown as ReturnType<typeof adminDb>,
  };
}
test('public page inventory keeps native IDs and decoded titles, excludes calendar pages, and refuses foreign subjects', () => {
  assert.deepEqual(
    parseProfileIndex([
      { ...page, title: { rendered: 'A &amp; B (2026)' } },
      { ...page, id: 124, title: { rendered: 'November Calendar' } },
    ]).map((r) => [r.source_id, r.title, r.film_year]),
    [['123', 'A & B', '2026']],
  );
  for (const patch of [
    { link: 'https://example.com/a-film-2026/' },
    { link: page.link + '?id=9' },
    { id: 1.5 },
    { modified_gmt: 'unknown' },
  ])
    assert.throws(() => parseProfileIndex([{ ...page, ...patch }]));
  const entry = inventoryEntries([row])[0];
  assert.equal(entry.sourceId, '123');
  assert.equal(entry.report.inventory, true);
  assert.equal(entry.revision, row.modified_at);
});
test('index advances with a cursor guard, wraps after completion, and retains its cursor during an outage', async () => {
  const original = globalThis.fetch,
    fake = fakeDb();
  try {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ ...page, id: i + 1 }))),
        { headers: { 'x-wp-totalpages': '9' } },
      );
    await indexWtsProfiles({ wts_profile_page: 2 }, fake.db, AbortSignal.timeout(1000));
    assert.deepEqual(fake.calls, ['a_list_queue_wts_profiles']);
    assert.equal(fake.writes[0].value.wts_profile_page, 3);
    assert.equal(fake.writes[0].filters.wts_profile_page, 2);
    globalThis.fetch = async () => new Response(JSON.stringify([page]));
    await indexWtsProfiles({ wts_profile_page: 9 }, fake.db, AbortSignal.timeout(1000));
    assert.equal(fake.writes[1].value.wts_profile_page, 1);
    assert.ok(
      Date.parse(String(fake.writes[1].value.wts_profile_after)) > Date.now() + 5 * 3600_000,
    );
    globalThis.fetch = async () => new Response('{}', { status: 503 });
    await assert.rejects(
      indexWtsProfiles({ wts_profile_page: 4 }, fake.db, AbortSignal.timeout(1000)),
      /unavailable/,
    );
    assert.equal(fake.writes.length, 2);
    globalThis.fetch = async () => {
      throw Error('not due');
    };
    await indexWtsProfiles(
      { wts_profile_after: new Date(Date.now() + 10000).toISOString() },
      fake.db,
      AbortSignal.timeout(1000),
    );
  } finally {
    globalThis.fetch = original;
  }
});
test('incremental discovery requests only edited pages, overlaps its boundary and advances after queuing with an independent cursor', async () => {
  const original = globalThis.fetch,
    fake = fakeDb(),
    through = page.modified_gmt + 'Z',
    requests: URL[] = [];
  try {
    globalThis.fetch = async (input, init) => {
      requests.push(new URL(String(input)));
      assert.equal(init?.cache, 'no-store');
      return Response.json([page, { ...page, id: 124, title: { rendered: 'November Calendar' } }]);
    };
    await indexWtsProfileChanges(
      { wts_profile_changes: { through }, wts_profile_page: 4 },
      fake.db,
      AbortSignal.timeout(1000),
    );
    const query = requests[0].searchParams;
    assert.equal(query.get('orderby'), 'modified');
    assert.equal(query.get('order'), 'asc');
    assert.equal(query.get('per_page'), '100');
    assert.equal(query.get('_fields'), 'id,link,title,modified_gmt');
    assert.equal(Date.parse(query.get('modified_after')!), Date.parse(through) - 120_000);
    assert.deepEqual(fake.queued, [[row]]);
    const cursor = fake.writes[0].value.wts_profile_changes as {
      through: string;
      checkedAt: string;
    };
    assert.equal(cursor.through, query.get('modified_before'));
    assert.equal(fake.writes[0].filters.wts_profile_changes, JSON.stringify({ through }));
    assert.equal(fake.writes[0].value.wts_profile_page, undefined);
    assert.equal(fake.writes[0].value.wts_profile_after, undefined);
    await indexWtsProfileChanges(
      { wts_profile_changes: cursor },
      fake.db,
      AbortSignal.timeout(1000),
    );
    assert.equal(requests.length, 1, 'an immediate duplicate call reuses the recent scan');
  } finally {
    globalThis.fetch = original;
  }
});
test('incremental discovery bounds catch-up pages, resumes the same window and keeps failed work replayable', async () => {
  const original = globalThis.fetch,
    fake = fakeDb(),
    through = page.modified_gmt + 'Z',
    requests: URL[] = [];
  try {
    globalThis.fetch = async (input) => {
      requests.push(new URL(String(input)));
      return Response.json(
        Array.from({ length: 100 }, (_, i) => ({ ...page, id: i + 1 })),
        {
          headers: { 'x-wp-totalpages': '2' },
        },
      );
    };
    await indexWtsProfileChanges(
      { wts_profile_changes: { through } },
      fake.db,
      AbortSignal.timeout(1000),
    );
    const next = {
      ...(fake.writes[0].value.wts_profile_changes as {
        through: string;
        before: string;
        page: number;
      }),
      checkedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    };
    assert.equal(next.through, through, 'unfinished pages cannot advance the watermark');
    assert.equal(next.page, 2);
    assert.equal(fake.calls.length, 1, 'one bounded page is fetched per run');
    globalThis.fetch = async () => Response.json({}, { status: 503 });
    await assert.rejects(
      indexWtsProfileChanges({ wts_profile_changes: next }, fake.db, AbortSignal.timeout(1000)),
      /unavailable/,
    );
    assert.equal(fake.writes.length, 1, 'an outage cannot advance the cursor');
    globalThis.fetch = async (input) => {
      requests.push(new URL(String(input)));
      return Response.json([page]);
    };
    await indexWtsProfileChanges({ wts_profile_changes: next }, fake.db, AbortSignal.timeout(1000));
    assert.equal(requests[1].searchParams.get('page'), '2');
    for (const key of ['modified_after', 'modified_before'])
      assert.equal(requests[0].searchParams.get(key), requests[1].searchParams.get(key));
    const final = fake.writes[1].value.wts_profile_changes as { through: string; page?: number };
    assert.equal(final.through, next.before);
    assert.equal(final.page, undefined);
    assert.equal(fake.writes[1].filters.wts_profile_changes, JSON.stringify(next));
  } finally {
    globalThis.fetch = original;
  }
});
test('incremental discovery rejects ignored filters and failed queue writes without losing changes, and starts with a small window', async () => {
  const original = globalThis.fetch,
    fake = fakeDb();
  try {
    globalThis.fetch = async () => Response.json([page]);
    await assert.rejects(
      indexWtsProfileChanges({}, fake.db, AbortSignal.timeout(1000)),
      /filter ignored/,
    );
    assert.equal(fake.writes.length, 0);
    assert.equal(fake.calls.length, 0);
    let query: URLSearchParams | undefined;
    globalThis.fetch = async (input) => {
      query = new URL(String(input)).searchParams;
      return Response.json([]);
    };
    const start = Date.now();
    await indexWtsProfileChanges({}, fake.db, AbortSignal.timeout(1000));
    assert.ok(Date.parse(query!.get('modified_after')!) >= start - 6 * 3600_000 - 120_000);
    assert.equal(fake.calls.length, 0, 'an empty change set does not queue film verification');
    assert.equal(fake.writes.length, 1);
    globalThis.fetch = async () => Response.json([page]);
    const db = {
      ...fake.db,
      rpc: () => ({
        abortSignal: async () => ({ data: null, error: { message: 'queue failed' } }),
      }),
    } as unknown as ReturnType<typeof adminDb>;
    await assert.rejects(
      indexWtsProfileChanges(
        { wts_profile_changes: { through: page.modified_gmt + 'Z' } },
        db,
        AbortSignal.timeout(1000),
      ),
    );
    assert.equal(fake.writes.length, 1, 'failed queuing leaves the old cursor for replay');
  } finally {
    globalThis.fetch = original;
  }
});
test('profile checkpoints bind to the fetched revision, leave unstarted work due and back off temporary failures', async () => {
  const fake = fakeDb(),
    signal = AbortSignal.timeout(1000);
  await checkpointWtsProfiles([row], [], fake.db, signal);
  assert.equal(fake.writes.length, 0);
  await checkpointWtsProfiles(
    [row],
    [{ source: row.source, outcome: 'source_unavailable' }],
    fake.db,
    signal,
  );
  const first = fake.writes[0];
  assert.equal(first.filters.modified_at, row.modified_at);
  assert.equal(first.filters.source_id, row.source_id);
  assert.equal(first.value.failures, 1);
  const delay = Date.parse(String(first.value.check_after)) - Date.now();
  assert.ok(delay > 590000 && delay <= 600000);
  await checkpointWtsProfiles(
    [{ ...row, failures: 3 }],
    [{ source: row.source, outcome: 'source_unavailable' }],
    fake.db,
    signal,
  );
  assert.equal(fake.writes[1].value.failures, 4);
  assert.ok(Date.parse(String(fake.writes[1].value.check_after)) > Date.now() + 70 * 60000);
  await checkpointWtsProfiles(
    [{ ...row, failures: 3 }],
    [{ source: row.source, outcome: 'matched', movieId: 'tt1234567' }],
    fake.db,
    signal,
  );
  assert.equal(fake.writes[2].value.failures, 0);
  await checkpointWtsProfiles(
    [{ ...row, attempts: 3, priority: 1 }],
    [{ source: row.source, outcome: 'insufficient_evidence' }],
    fake.db,
    signal,
  );
  assert.equal(fake.writes[3].value.attempts, 4);
  assert.equal(fake.writes[3].value.priority, 0);
  assert.ok(Date.parse(String(fake.writes[3].value.check_after)) > Date.now() + 6 * 86400_000);
  await checkpointWtsProfiles(
    [{ ...row, priority: 2 }],
    [{ source: row.source, outcome: 'matched', partial: true }],
    fake.db,
    signal,
  );
  assert.equal(fake.writes[4].value.priority, 2);
  assert.equal(fake.writes[4].value.failures, 1);
  assert.ok(
    Date.parse(String(fake.writes[4].value.check_after)) < Date.now() + 11 * 60000,
    'Partial checks cannot wait a week',
  );
});
test('reconciliation counts missing, changed and explicitly withdrawn windows while preserving primary dates and unknown fields', () => {
  const release: Release = {
    kind: 'Digital',
    date: '2026-10-28',
    confidence: 'listed',
    source: row.source,
    sourceName: 'When To Stream',
  };
  const movie = {
    releases: [release, { ...release, kind: 'Subscription', platform: 'Netflix' }],
  } as Movie;
  assert.equal(reconcileReleaseDates(undefined, [release], row.source).missing, 1);
  assert.equal(
    reconcileReleaseDates(movie, [{ ...release, date: '2026-10-29' }], row.source).changed,
    1,
  );
  const audit = reconcileReleaseDates(movie, [], row.source, ['Digital'], ['Subscription']);
  assert.equal(audit.withdrawn, 1);
  assert.deepEqual(audit.unknownKinds, ['Subscription']);
  assert.equal(reconcileReleaseDates(movie, [], row.source, [], ['Digital']).withdrawn, 0);
  assert.equal(
    reconcileReleaseDates(
      { ...movie, releases: [{ ...release, sourceName: 'DVDs Release Dates' }] },
      [{ ...release, date: '2026-10-29' }],
      row.source,
    ).primaryPreferred,
    1,
  );
});
test('inventory queue is service-only and only new or changed revisions become due', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
      create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
      grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
    const dir = new URL('../supabase/migrations/', import.meta.url);
    for (const name of (await readdir(dir)).filter((n) => n.endsWith('.sql')).sort())
      await db.exec(await readFile(new URL(name, dir), 'utf8'));
    const queue = (r = row) =>
      db.query('select public.a_list_queue_wts_profiles($1::jsonb)', [JSON.stringify([r])]);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(queue(), /permission denied/);
      await assert.rejects(
        db.query('select * from public.a_list_wts_profiles'),
        /permission denied/,
      );
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    await queue();
    await db.exec(
      "update public.a_list_wts_profiles set check_after='2099-01-01',outcome='matched'",
    );
    await queue();
    await queue({ ...row, modified_at: '2000-01-01T00:00:00Z', title: 'Old title' });
    const stored = () =>
      db.query<{ title: string; due: boolean }>(
        'select title,check_after<=now() as due from public.a_list_wts_profiles',
      );
    assert.deepEqual((await stored()).rows, [{ title: row.title, due: false }]);
    await queue({ ...row, modified_at: '2026-10-28T12:00:00Z' });
    assert.equal((await stored()).rows[0].due, true);
    assert.equal(
      (await db.query<{ n: number }>('select attempts as n from public.a_list_wts_profiles'))
        .rows[0].n,
      0,
    );
    await assert.rejects(
      queue({ ...row, source: 'https://example.com/film/' }),
      /check constraint/,
    );
    await assert.rejects(
      db.query("select public.a_list_queue_wts_profiles('{}')"),
      /Invalid source/,
    );
  } finally {
    await db.close();
  }
});
