import { test } from 'node:test';
import assert from 'node:assert/strict';
import { durationMilliseconds } from '../lib/motion-duration';

test('motion durations preserve milliseconds when CSS minifies tokens to seconds', () => {
  assert.equal(durationMilliseconds('260ms', 120), 260);
  assert.equal(durationMilliseconds('.26s', 120), 260);
  assert.equal(durationMilliseconds(' 0.28s ', 120), 280);
  assert.equal(durationMilliseconds('0ms', 120), 0);
  assert.equal(durationMilliseconds('', 120), 120);
  assert.equal(durationMilliseconds('inherit', 120), 120);
});
