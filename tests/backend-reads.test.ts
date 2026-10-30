import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import { ingestionPayload } from '../lib/ingestion-state';
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
const { account, updateLibrary, updateSettings } = await import('../lib/data');
const owner = { id: 'owner', feed_token: 'original-token', include_rumors: true };
function fixture(handler: (url: URL, init?: RequestInit) => unknown) {
  const requests: { url: URL; method: string; body: unknown }[] = [];
  const db = createClient('https://database.example.invalid', 'fixture-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        requests.push({
          url,
          method: init?.method || 'GET',
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        return new Response(JSON.stringify(handler(url, init)), {
          headers: { 'content-type': 'application/json' },
        });
      },
    },
  });
  return { db, requests };
}
test('existing accounts initialize with one read and missing accounts recover after a concurrent insert', async () => {
  const existing = fixture(() => owner);
  assert.deepEqual(await account({ db: existing.db, userId: owner.id }), owner);
  assert.deepEqual(
    existing.requests.map((r) => r.method),
    ['GET'],
  );
  let reads = 0;
  const missing = fixture((_url, init) =>
    init?.method === 'POST' ? null : ++reads === 1 ? null : owner,
  );
  assert.deepEqual(await account({ db: missing.db, userId: owner.id }), owner);
  assert.deepEqual(
    missing.requests.map((r) => r.method),
    ['GET', 'POST', 'GET'],
  );
  assert.deepEqual(missing.requests[1].body, { id: owner.id });
});
test('saving/removing films has no account preflight and settings use one scoped upsert', async () => {
  const f = fixture((url, init) =>
    url.pathname.endsWith('/a_list_movies')
      ? [{ id: '123', movie: { id: '123' } }]
      : init?.method === 'GET'
        ? []
        : null,
  );
  const ctx = { db: f.db, userId: owner.id };
  await updateLibrary(ctx, 'add', ['123']);
  await updateLibrary(ctx, 'remove', ['123']);
  assert.equal(f.requests.length, 3);
  assert.ok(f.requests.every((r) => !r.url.pathname.endsWith('/a_list_accounts')));
  await updateSettings(ctx, false);
  assert.equal(f.requests.length, 4);
  assert.deepEqual(f.requests[3].body, { id: owner.id, include_rumors: false });
});
test('worker payload is lazy, shared across phases, projected and abortable', async () => {
  const f = fixture(() => ({ catalogue: [{ id: '123' }], wts_feed: [], wts_feed_after: null }));
  const payload = ingestionPayload(f.db, AbortSignal.timeout(1000));
  assert.equal(f.requests.length, 0);
  const [first, second] = await Promise.all([payload(), payload()]);
  assert.deepEqual(first.catalogue, [{ id: '123' }]);
  assert.equal(first, second);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].url.searchParams.get('select'), 'catalogue,wts_feed,wts_feed_after');
});
