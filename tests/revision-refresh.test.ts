import test from 'node:test';
import assert from 'node:assert/strict';
import { revisionRefresh } from '../lib/revision-refresh';

test('revision polling synchronizes once, skips unchanged content and acknowledges only successful refreshes', async () => {
  let revision = 'a'.repeat(32),
    loads = 0,
    success = true;
  const refresh = revisionRefresh(
    async () => revision,
    async () => {
      loads++;
      return success;
    },
  );
  await refresh();
  await refresh();
  assert.equal(loads, 1);
  revision = 'b'.repeat(32);
  success = false;
  await assert.rejects(refresh(), /did not complete/);
  success = true;
  await refresh();
  await refresh();
  assert.equal(loads, 3);
});

test('revision polling keeps edits during a load visible to the next poll and rejects unavailable revisions', async () => {
  let revision = 'a'.repeat(32),
    loads = 0;
  const refresh = revisionRefresh(
    async () => revision,
    async () => {
      loads++;
      revision = 'b'.repeat(32);
      return true;
    },
  );
  await refresh();
  await refresh();
  await refresh();
  assert.equal(loads, 2);
  revision = 'invalid';
  await assert.rejects(refresh(), /Invalid/);
  assert.equal(loads, 2);
});
