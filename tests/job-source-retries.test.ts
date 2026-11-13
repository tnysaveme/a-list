import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createHash, createHmac } from 'node:crypto';
Object.assign(globalThis, { __afterlightJobResult: { failed: 0, sourceFailures: 1 } });
registerHooks({
  resolve(s, c, n) {
    return s.endsWith('/lib/ingestion')
      ? {
          url: 'data:text/javascript,export async function refreshSources(){return globalThis.__afterlightJobResult}',
          shortCircuit: true,
        }
      : n(s, c);
  },
});
const { POST } = await import('../app/api/jobs/refresh/route');
test('a per-film source retry does not redeliver the entire pipeline, while operational failures remain retryable', async () => {
  const saved = { ...process.env };
  Object.assign(process.env, {
    ALIST_APP_URL: 'https://fixture.example.invalid',
    QSTASH_CURRENT_SIGNING_KEY: 'fixture-current-signing-key',
    QSTASH_NEXT_SIGNING_KEY: 'fixture-next-signing-key',
  });
  try {
    const url = process.env.ALIST_APP_URL + '/api/jobs/refresh',
      body = '{}',
      now = Math.floor(Date.now() / 1000);
    const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const content =
      encode({ alg: 'HS256', typ: 'JWT' }) +
      '.' +
      encode({
        iss: 'Upstash',
        sub: url,
        nbf: now - 1,
        exp: now + 60,
        body: createHash('sha256').update(body).digest('base64url'),
      });
    const signature =
      content +
      '.' +
      createHmac('sha256', process.env.QSTASH_CURRENT_SIGNING_KEY!)
        .update(content)
        .digest('base64url');
    const request = () =>
      new Request(url, { method: 'POST', headers: { 'upstash-signature': signature }, body });
    assert.equal((await POST(request())).status, 200);
    Object.assign(globalThis, { __afterlightJobResult: { failed: 1, sourceFailures: 0 } });
    assert.equal((await POST(request())).status, 503);
    assert.equal((await POST(new Request(url, { method: 'POST', body }))).status, 401);
  } finally {
    for (const key of ['ALIST_APP_URL', 'QSTASH_CURRENT_SIGNING_KEY', 'QSTASH_NEXT_SIGNING_KEY']) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});
