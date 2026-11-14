import test from 'node:test';
import assert from 'node:assert/strict';
import { offlineMovies } from '../lib/offline-library';
test('offline projection keeps reading data and excludes account, feed and source credentials', () => {
  const rows = offlineMovies([
    {
      movieId: 'tt1234567',
      title: '<script>Example</script>',
      year: '2026',
      watchedAt: null,
      email: 'private@example.invalid',
      feedPath: '/api/feed/secret.ics',
      access_token: 'secret',
      releases: [
        {
          date: '2026-12-01',
          kind: 'Digital',
          confidence: 'rumored',
          source: 'https://example.invalid/private-token',
          platform: 'Example',
        },
      ],
    },
  ]);
  assert.deepEqual(rows, [
    {
      id: 'tt1234567',
      title: '<script>Example</script>',
      year: '2026',
      watchedAt: null,
      releases: [
        { date: '2026-12-01', kind: 'Digital', confidence: 'rumored', platform: 'Example' },
      ],
    },
  ]);
  assert.doesNotMatch(JSON.stringify(rows), /private|secret|email|access_token|feedPath/);
});
