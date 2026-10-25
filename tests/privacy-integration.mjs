// Explicitly enabled operator test: two disposable Auth users, two reserved films.
// Uses a local application server; never imports a session into the owner's browser.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
if (process.env.ALIST_RUN_DATABASE_TESTS !== 'true') {
  console.log('SKIP: enable ALIST_RUN_DATABASE_TESTS for disposable privacy integration fixtures.');
  process.exit(0);
}
const base = process.env.ALIST_BASE_URL || 'http://127.0.0.1:3139';
assert.ok(
  ['localhost', '127.0.0.1'].includes(new URL(base).hostname),
  'Use a local application server for this fixture test',
);
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const checked = (r) => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};
const users = [],
  ids = ['99000001', '99000002'];
let inserted = false;
const movie = (id, index) => ({
  id,
  title: `Privacy fixture ${index}`,
  year: '2026',
  poster: '',
  source: `https://www.dvdsreleasedates.com/movies/${id}/privacy-fixture`,
  checkedAt: new Date().toISOString(),
  releases:
    index === 1
      ? [
          {
            kind: 'Digital',
            date: '2099-11-11',
            source: 'https://www.dvdsreleasedates.com/',
            sourceName: 'Test fixture',
            confidence: 'listed',
          },
        ]
      : [],
});
const request = async (path, { user = 0, body, origin = base, status = 200 } = {}) => {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      cookie: users[user].cookie,
      ...(body !== undefined ? { Origin: origin, 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.equal(response.status, status, `${path}: ${response.status}`);
  return response;
};
try {
  assert.equal(
    checked(await admin.from('a_list_movies').select('id').in('id', ids)).length,
    0,
    'Reserved fixture IDs already exist',
  );
  for (let index = 0; index < 2; index++) {
    const email = `alist-privacy-test-${randomUUID()}@example.invalid`,
      password = randomBytes(32).toString('hex');
    const user = checked(
      await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    ).user;
    const fixture = { id: user.id, email, cookie: '', token: '', refreshToken: '', deleted: false };
    users.push(fixture);
    const cookies = [];
    const client = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      {
        cookies: {
          getAll: () => cookies,
          setAll: (values) => {
            for (const v of values) {
              const i = cookies.findIndex((c) => c.name === v.name);
              if (i >= 0) cookies[i] = v;
              else cookies.push(v);
            }
          },
        },
      },
    );
    const signed = checked(await client.auth.signInWithPassword({ email, password }));
    fixture.token = signed.session.access_token;
    fixture.refreshToken = signed.session.refresh_token;
    fixture.cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  }
  checked(
    await admin.from('a_list_movies').insert(
      ids.map((id, index) => ({
        id,
        movie: movie(id, index + 1),
        refresh_after: '2099-01-01T00:00:00Z',
      })),
    ),
  );
  inserted = true;
  for (let index = 0; index < 2; index++) await request('/api/init', { user: index, body: {} });
  await request('/api/library', { body: { action: 'add', ids } });
  await request('/api/library', { user: 1, body: { action: 'add', ids: [ids[1]] } });
  const ownMembership = await (
    await request('/api/library/membership?ids=' + ids.join(','))
  ).json();
  const otherMembership = await (
    await request('/api/library/membership?ids=' + ids.join(','), { user: 1 })
  ).json();
  assert.deepEqual(ownMembership.membership, Object.fromEntries(ids.map((id) => [id, true])));
  assert.deepEqual(otherMembership.membership, { [ids[0]]: false, [ids[1]]: true });
  await request('/api/library/membership?ids=', { status: 400 });
  await request(
    '/api/library/membership?ids=' +
      Array.from({ length: 101 }, (_, i) => String(98000000 + i)).join(','),
    { status: 400 },
  );
  checked(
    await admin
      .from('a_list_source_cache')
      .insert({ user_id: users[0].id, key: 'privacy-fixture', value: { test: true } }),
  );
  const original = await (await request('/api/init', { body: {} })).json(),
    other = await (await request('/api/init', { user: 1, body: {} })).json();
  const exported = await request('/api/account/export'),
    data = await exported.json();
  assert.match(exported.headers.get('content-disposition'), /attachment/);
  assert.equal(data.library.length, 2);
  assert.equal(data.account.email, users[0].email);
  assert.ok(data.library.some((f) => f.releases.length === 0));
  assert.ok(data.library.every((f) => f.savedAt && f.calendarTracking));
  assert.equal(JSON.stringify(data).includes(original.feedPath), false);
  assert.equal(JSON.stringify(data).includes(users[1].email), false);
  for (const path of ['/api/account/reset-calendar', '/api/account/delete']) {
    await request(path, {
      body: { confirmation: path.endsWith('delete') ? 'DELETE' : 'RESET' },
      origin: 'https://other.example',
      status: 403,
    });
    await request(path, { body: { confirmation: 'wrong' }, status: 400 });
  }
  await request('/api/account/delete', { body: null, status: 400 });
  const cached = await fetch(base + original.feedPath);
  assert.equal(cached.status, 200);
  const etag = cached.headers.get('etag');
  assert.equal(
    (await fetch(base + original.feedPath, { headers: { 'If-None-Match': etag } })).status,
    304,
  );
  const reset = await (
    await request('/api/account/reset-calendar', {
      body: { confirmation: 'RESET', userId: users[1].id },
    })
  ).json();
  assert.notEqual(reset.feedPath, original.feedPath);
  assert.equal(
    (await fetch(base + original.feedPath, { headers: { 'If-None-Match': etag } })).status,
    404,
  );
  const current = await fetch(base + reset.feedPath);
  assert.equal(current.status, 200);
  const calendarText = await current.text();
  assert.match(calendarText, /UID:movie-99000001-digital@afterlight/);
  assert.match(calendarText, /BEGIN:VALARM/);
  assert.match(calendarText, /20991111T130000Z/);
  assert.equal((await fetch(base + other.feedPath)).status, 200);
  const deleted = await request('/api/account/delete', {
    body: { confirmation: 'DELETE', userId: users[1].id },
  });
  assert.equal((await deleted.json()).deleted, true);
  assert.match(deleted.headers.get('set-cookie') || '', /Max-Age=0/i);
  users[0].deleted = true;
  await request('/api/init', { body: {}, status: 401 });
  assert.equal((await fetch(base + reset.feedPath)).status, 404);
  assert.equal(
    checked(await admin.from('a_list_library').select('movie_id').eq('user_id', users[0].id))
      .length,
    0,
  );
  assert.equal(
    checked(await admin.from('a_list_source_cache').select('key').eq('user_id', users[0].id))
      .length,
    0,
  );
  const remaining = await (await request('/api/init', { user: 1, body: {} })).json();
  assert.equal(remaining.total, 1);
  assert.equal(checked(await admin.from('a_list_movies').select('id').in('id', ids)).length, 2);
  const auth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const revived = await auth.auth.refreshSession({ refresh_token: users[0].refreshToken });
  assert.ok(revived.error);
  console.log(
    'PASS: complete private export, unknown-date films, origin/confirmation checks, cached-feed revocation, other-account isolation, session-cookie clearing and deletion cascades.',
  );
} finally {
  for (const user of users) {
    if (!user.deleted) {
      if (user.token) await admin.auth.admin.signOut(user.token, 'global');
      const found = await admin.auth.admin.getUserById(user.id);
      if (found.data.user) {
        assert.match(found.data.user.email, /^alist-privacy-test-.*@example\.invalid$/);
        checked(await admin.auth.admin.deleteUser(user.id));
      }
    }
  }
  if (inserted) checked(await admin.from('a_list_movies').delete().in('id', ids));
  console.log('Disposable privacy fixtures removed.');
}
