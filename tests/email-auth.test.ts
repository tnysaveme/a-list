import assert from 'node:assert/strict';
import test from 'node:test';
import { validEmailToken, emailAuthFailure } from '../lib/email-auth';
test('email confirmation rejects malformed credentials without confusing outages with expired links', () => {
  for (const value of [
    null,
    undefined,
    '',
    'short',
    ['a'.repeat(64)],
    '<script>'.repeat(10),
    'a'.repeat(257),
  ])
    assert.equal(validEmailToken(value), false);
  assert.equal(validEmailToken('a'.repeat(64)), true);
  assert.equal(emailAuthFailure(null), null);
  assert.equal(emailAuthFailure({ status: 403, code: 'otp_expired' }), 'expired-link');
  assert.equal(emailAuthFailure({ status: 503 }), 'service-unavailable');
  assert.equal(emailAuthFailure({}), 'service-unavailable');
  assert.equal(emailAuthFailure({ status: 429 }), 'rate-limit');
});
