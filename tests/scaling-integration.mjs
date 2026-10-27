import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
if (process.env.ALIST_RUN_DATABASE_TESTS !== 'true') {
  console.log(
    'SKIP: set ALIST_RUN_DATABASE_TESTS=true to run disposable database integration tests.',
  );
  process.exit(0);
}
const base = process.env.ALIST_BASE_URL || 'http://127.0.0.1:3000';
assert.ok(
  ['127.0.0.1', 'localhost'].includes(new URL(base).hostname),
  'This integration suite targets a local test server only',
);
mkdirSync('outputs/.secrets', { recursive: true, mode: 0o700 });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const check = (r) => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};
const stateFile = 'outputs/.secrets/fixtures.json';
const mode = process.argv[2] || 'all';
if (mode === 'all') {
  try {
    execFileSync(process.execPath, [fileURLToPath(import.meta.url), 'setup'], { stdio: 'inherit' });
    execFileSync(process.execPath, [fileURLToPath(import.meta.url), 'test'], { stdio: 'inherit' });
  } catch {
    process.exitCode = 1;
  } finally {
    if (existsSync(stateFile))
      execFileSync(process.execPath, [fileURLToPath(import.meta.url), 'cleanup'], {
        stdio: 'inherit',
      });
  }
  process.exit(process.exitCode || 0);
}
if (mode === 'setup') {
  assert.ok(!existsSync(stateFile), 'Clean up the prior fixtures first');
  const users = [];
  for (let i = 0; i < 2; i++) {
    const email = `alist-test-${randomUUID()}@example.invalid`,
      password = randomBytes(32).toString('hex');
    const user = check(
      await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    ).user;
    const cookies = [];
    const auth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      { cookies: { getAll: () => [], setAll: (values) => cookies.push(...values) } },
    );
    check(await auth.auth.signInWithPassword({ email, password }));
    users.push({
      id: user.id,
      cookies,
      cookie: cookies.map((c) => c.name + '=' + c.value).join('; '),
    });
    writeFileSync(stateFile, JSON.stringify({ users, ids: [] }), { mode: 0o600 });
  }
  const template = JSON.parse(readFileSync('lib/catalogue.json', 'utf8'))[0];
  const movies = Array.from({ length: 1500 }, (_, i) => ({
    ...template,
    id: String(80000000 + i),
    title: `Scaling fixture ${String(i).padStart(4, '0')}`,
    checkedAt: new Date().toISOString(),
    source: `https://www.dvdsreleasedates.com/movies/${80000000 + i}/scaling-fixture`,
    releases:
      i % 3
        ? [
            {
              kind: 'Digital',
              date: '2026-11-20',
              confidence: i % 5 ? 'listed' : 'rumored',
              source: 'https://www.dvdsreleasedates.com/',
              sourceName: 'Test fixture',
            },
          ]
        : [],
  }));
  const ids = movies.map((m) => m.id);
  for (let i = 0; i < ids.length; i += 500) {
    const existing = check(
      await admin
        .from('a_list_movies')
        .select('id')
        .in('id', ids.slice(i, i + 500)),
    );
    assert.equal(existing.length, 0, 'Reserved test IDs already exist');
  }
  writeFileSync(stateFile, JSON.stringify({ users, ids }), { mode: 0o600 });
  for (let start = 0; start < movies.length; start += 200)
    check(
      await admin.from('a_list_movies').insert(
        movies.slice(start, start + 200).map((movie) => ({
          id: movie.id,
          movie,
          refresh_after: new Date(Date.now() + 86400_000).toISOString(),
        })),
      ),
    );
  check(await admin.from('a_list_accounts').insert(users.map((u) => ({ id: u.id }))));
  for (let start = 0; start < movies.length; start += 200)
    check(
      await admin.from('a_list_library').insert(
        movies.slice(start, start + 200).map((movie, i) => ({
          user_id: users[0].id,
          movie_id: movie.id,
          movie,
          tracked: start + i === 1,
        })),
      ),
    );
  console.log('Created two disposable users and 1,500 film fixtures; no email sent.');
  process.exit(0);
}
const state = JSON.parse(readFileSync(stateFile, 'utf8'));
if (mode === 'cleanup') {
  for (const user of state.users) {
    const found = check(await admin.auth.admin.getUserById(user.id)).user;
    assert.match(found.email, /^alist-test-.*@example\.invalid$/);
    check(await admin.auth.admin.deleteUser(user.id));
  }
  for (let start = 0; start < state.ids.length; start += 200)
    check(
      await admin
        .from('a_list_movies')
        .delete()
        .in('id', state.ids.slice(start, start + 200)),
    );
  const { unlinkSync } = await import('node:fs');
  unlinkSync(stateFile);
  console.log('Disposable users and film fixtures removed.');
  process.exit(0);
}
const request = async (path, { user = 0, body, headers = {}, status = 200 } = {}) => {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      cookie: state.users[user].cookie,
      ...(body ? { Origin: base, 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.equal(r.status, status, `${path} returned ${r.status}: ${await r.clone().text()}`);
  return r;
};
const first = await (await request('/api/init', { body: {} })).json();
assert.equal(first.total, 1500);
assert.equal(first.movies.length, 25);
assert.equal((await (await request('/api/init', { user: 1, body: {} })).json()).total, 0);
const page1 = await (await request('/api/library?sort=title')).json(),
  page2 = await (await request('/api/library?sort=title&offset=25')).json();
assert.equal(page1.movies[0].title, 'Scaling fixture 0000');
assert.equal(page2.movies[0].title, 'Scaling fixture 0025');
assert.equal(page2.movies.length, 25);
const last = await (await request('/api/library?sort=title&offset=1475')).json();
assert.equal(last.movies[24].title, 'Scaling fixture 1499');
assert.equal(last.nextOffset, null);
const unknown = await (await request('/api/library?filter=unknown')).json();
assert.equal(unknown.filteredTotal, 500);
assert.ok(unknown.movies.every((m) => !m.releases.length));
await request('/api/library?sort=unsafe', { status: 400 });
const url = base + first.feedPath;
const feed = await fetch(url);
assert.equal(feed.status, 200);
const body = await feed.text();
assert.match(body, /UID:movie-80000001-digital@afterlight/);
assert.match(body, /20261120T130000Z/);
assert.match(body, /DTEND:20261120T133000Z/);
assert.match(body, /TRIGGER;RELATED=START:PT0S/);
const etag = feed.headers.get('etag');
assert.ok(etag);
const unchanged = await fetch(url, { headers: { 'If-None-Match': etag } });
assert.equal(unchanged.status, 304);
assert.equal(await unchanged.text(), '');
await request(first.feedPath, { user: 1, status: 404 });
await request('/api/library', { user: 1, body: { action: 'remove', ids: ['80000001'] } });
assert.equal((await fetch(url, { headers: { 'If-None-Match': etag } })).status, 304);
await request('/api/library', { body: { action: 'remove', ids: ['80000001'] } });
const removed = await fetch(url, { headers: { 'If-None-Match': etag } });
assert.equal(removed.status, 200);
assert.doesNotMatch(await removed.text(), /UID:movie-80000001/);
await request('/api/library', { body: { action: 'add', ids: ['80000001'] } });
const restored = await fetch(url);
assert.match(await restored.text(), /UID:movie-80000001/);
await request('/api/settings', { body: { includeRumors: true } });
assert.equal(
  (await fetch(url, { headers: { 'If-None-Match': restored.headers.get('etag') } })).status,
  200,
);
await request('/api/health', { status: 404 });
assert.equal((await fetch(base + '/api/jobs/refresh', { method: 'POST', body: '{}' })).status, 401);
assert.equal(
  (
    await fetch(base + '/api/jobs/refresh', {
      method: 'POST',
      headers: { 'upstash-signature': 'forged' },
      body: '{}',
    })
  ).status,
  401,
);
for (let i = 0; i < 15; i++) await request('/api/search?q=a');
const blocked = await request('/api/search?q=a', { status: 429 });
assert.ok(Number(blocked.headers.get('retry-after')) > 0);
console.log(
  'PASS: 1,500-film pagination and global filtering, separate users, feed ETag/304, removal invalidation, rumors settings, unauthorized job rejection, owner-only health and search rate limits.',
);
