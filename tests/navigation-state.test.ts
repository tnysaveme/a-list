import test from 'node:test';
import assert from 'node:assert/strict';
import { navigationUrl, readNavigation } from '../lib/navigation-state';

test('navigation restores only supported section, filter and sort values', () => {
  assert.deepEqual(
    readNavigation(new URLSearchParams('section=discover&filter=unknown&sort=added'), 'library'),
    { section: 'discover', filter: 'unknown', sort: 'release' },
  );
  assert.deepEqual(
    readNavigation(new URLSearchParams('section=other&filter=other&sort=other'), 'library'),
    { section: 'library', filter: 'all', sort: 'release' },
  );
});
test('navigation URLs omit default queries and preserve unrelated route state', () => {
  assert.equal(
    navigationUrl('https://example.invalid/?filter=unknown&sort=title#main', {
      section: 'library',
      filter: 'all',
      sort: 'release',
    }),
    '/?section=library#main',
  );
  assert.equal(
    navigationUrl('https://example.invalid/?section=library', {
      section: 'discover',
      filter: 'soon',
      sort: 'title',
    }),
    '/?section=discover&filter=soon&sort=title',
  );
});
