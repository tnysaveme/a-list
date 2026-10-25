import test from 'node:test';
import assert from 'node:assert/strict';

test('unit tests have no provider credentials or production platform switches and reject unmocked network', async () => {
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(
    Object.keys(process.env).some((key) =>
      /^(ALIST_|UPSTASH_|QSTASH_|SUPABASE_|NEXT_PUBLIC_SUPABASE_|VERCEL)/.test(key),
    ),
    false,
  );
  await assert.rejects(
    fetch('https://example.invalid/unit-test'),
    /Unexpected network request in a unit test/,
  );
});
