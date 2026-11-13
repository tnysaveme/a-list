import { readFile } from 'node:fs/promises';
import { inspectWtsProfile, inspectWtsFeed } from '../lib/wts-drift';
import { fetchSource } from '../lib/sources';
const manifest = JSON.parse(
  await readFile(new URL('../tests/fixtures/wts/manifest.json', import.meta.url), 'utf8'),
) as { profiles: { url: string; title: string; sourceId: string }[]; feed: { url: string } };
let failures = 0;
// Public source reads only. Expectations cover structure and identity; dates may legitimately change.
for (const profile of manifest.profiles) {
  try {
    const { evidence } = inspectWtsProfile(
      await fetchSource(profile.url, { cache: 'no-store', signal: AbortSignal.timeout(10000) }),
      profile,
    );
    console.log(
      JSON.stringify({
        event: 'wts_drift_check',
        sourceId: profile.sourceId,
        ok: true,
        windows: evidence.reports.length,
      }),
    );
  } catch {
    failures++;
    console.log(
      JSON.stringify({ event: 'wts_drift_check', sourceId: profile.sourceId, ok: false }),
    );
  }
}
try {
  const reports = inspectWtsFeed(
    await fetchSource(manifest.feed.url, { cache: 'no-store', signal: AbortSignal.timeout(10000) }),
  );
  console.log(JSON.stringify({ event: 'wts_feed_drift_check', ok: true, reports: reports.length }));
} catch {
  failures++;
  console.log(JSON.stringify({ event: 'wts_feed_drift_check', ok: false }));
}
if (failures) process.exitCode = 1;
