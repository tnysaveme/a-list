import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizePerformanceEvent } from '../lib/performance-event';
test('performance reporting strips all query/hash values and rejects sensitive routes', () => {
  assert.deepEqual(
    sanitizePerformanceEvent({
      type: 'vital',
      url: 'https://example.invalid/?section=discover&q=private#film',
      route: '/?q=private',
    }),
    { type: 'vital', url: 'https://example.invalid/', route: '/' },
  );
  for (const path of [
    '/auth/confirm?token_hash=private',
    '/api/feed/private.ics',
    '/api/account/export',
  ])
    assert.equal(sanitizePerformanceEvent({ url: `https://example.invalid${path}` }), null);
  assert.equal(sanitizePerformanceEvent({ url: 'invalid' }), null);
});
