// Opt-in live check: one disposable account; existing sourced films only; no email.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

if (process.env.ALIST_RUN_WTS_CALENDAR_TEST !== 'true') {
  console.log('SKIP: enable ALIST_RUN_WTS_CALENDAR_TEST for the disposable live calendar check.');
  process.exit(0);
}
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const base = process.env.ALIST_BASE_URL;
assert.equal(
  base,
  'https://a-list-nine.vercel.app',
  'Select the intended live A-List app explicitly',
);
assert.equal(
  new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,
  'xuxshqjckbrvxiwzclfi.supabase.co',
);
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
const checked = ({ data, error }) => {
  if (error) throw new Error('Disposable fixture operation failed');
  return data;
};
const ids = ['tt37593192', 'tt30217600'];
const cookies = [];
const client = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  {
    cookies: {
      getAll: () => cookies,
      setAll(values) {
        for (const value of values) {
          const index = cookies.findIndex((cookie) => cookie.name === value.name);
          if (index >= 0) cookies[index] = value;
          else cookies.push(value);
        }
      },
    },
  },
);
let userId,
  stage = 'preflight',
  feedPath;
const request = async (path, body) => {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '),
      ...(body === undefined ? {} : { origin: base, 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  assert.equal(response.status, 200, `${stage}: application request failed`);
  return response.json();
};
const feed = async (headers = {}) => {
  assert.match(feedPath, /^\/api\/feed\/[a-f0-9-]{68}\.ics$/);
  // No authentication cookie: external calendar clients must reach the secret URL directly.
  return fetch(base + feedPath, { headers, signal: AbortSignal.timeout(20_000) });
};
try {
  const films = checked(await admin.from('a_list_movies').select('id,movie').in('id', ids));
  assert.equal(
    films.length,
    ids.length,
    'Repair and verify the sourced films before running this check',
  );
  const expected = films.map(({ id, movie }) => {
    const release = movie.releases.find(
      (release) => release.sourceName === 'When To Stream' && release.confidence === 'listed',
    );
    assert.ok(release, 'Each test film needs a verified WTS date');
    return { id, kind: release.kind.toLowerCase(), day: release.date.replaceAll('-', '') };
  });
  stage = 'create disposable account';
  const email = `alist-wts-calendar-${randomUUID()}@example.invalid`,
    password = randomBytes(32).toString('hex');
  userId = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user
    .id;
  stage = 'normal sign-in';
  checked(await client.auth.signInWithPassword({ email, password }));
  stage = 'initialize calendar';
  const initial = await request('/api/init', {});
  feedPath = initial.feedPath;
  assert.equal(initial.feedPublic, true);
  stage = 'save sourced films';
  await request('/api/library', { action: 'add', ids });
  const first = await feed();
  assert.equal(first.status, 200);
  assert.match(first.headers.get('content-type'), /text\/calendar/);
  const body = await first.text();
  assert.equal((body.match(/BEGIN:VEVENT/g) || []).length, expected.length);
  for (const { id, kind, day } of expected) {
    assert.ok(body.includes(`UID:movie-${id}-${kind}@afterlight`));
    assert.ok(body.includes(`DTSTART:${day}T130000Z`));
  }
  assert.match(body, /TRIGGER;RELATED=START:PT0S/);
  assert.equal((await feed({ 'if-none-match': first.headers.get('etag') })).status, 304);
  stage = 'watched exclusion';
  await request('/api/library', { action: 'watch', ids });
  const watched = await feed({ 'if-none-match': first.headers.get('etag') });
  assert.equal(watched.status, 200);
  assert.doesNotMatch(await watched.text(), /BEGIN:VEVENT/);
  stage = 'unwatched recovery';
  await request('/api/library', { action: 'unwatch', ids });
  const restored = await (await feed()).text();
  for (const { id, kind } of expected)
    assert.ok(restored.includes(`UID:movie-${id}-${kind}@afterlight`));
  assert.equal((await request('/api/init', {})).feedPath, feedPath);
  stage = 'removal';
  await request('/api/library', { action: 'remove', ids });
  assert.doesNotMatch(await (await feed()).text(), /BEGIN:VEVENT/);
  console.log(
    JSON.stringify({
      event: 'live_wts_calendar_verified',
      films: ids.length,
      anonymousFeed: true,
      stableUids: true,
      alarmsAt13Utc: true,
      conditionalRefresh: true,
      watchedRecovery: true,
      feedLinkPreserved: true,
    }),
  );
} catch {
  console.error(JSON.stringify({ event: 'live_wts_calendar_failed', stage }));
  process.exitCode = 1;
} finally {
  if (userId) {
    await client.auth.signOut({ scope: 'global' }).catch(() => {});
    const removed = await admin.auth.admin.deleteUser(userId);
    if (removed.error) {
      console.error(JSON.stringify({ event: 'live_wts_calendar_cleanup_failed', userId }));
      process.exitCode = 1;
    } else {
      const remaining = checked(
        await admin.from('a_list_library').select('movie_id').eq('user_id', userId),
      );
      assert.equal(remaining.length, 0);
      if (feedPath) assert.equal((await feed()).status, 404);
      console.log(JSON.stringify({ event: 'live_wts_calendar_fixture_removed', libraryRows: 0 }));
    }
  }
}
