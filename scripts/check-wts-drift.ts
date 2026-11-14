import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { driftSummary, probeWtsSources, type WtsProfileExpectation } from '../lib/wts-drift';
import { fetchSource } from '../lib/sources';
const manifest = JSON.parse(
  await readFile(new URL('../tests/fixtures/wts/manifest.json', import.meta.url), 'utf8'),
) as {
  profiles: WtsProfileExpectation[];
  feed: { url: string };
};
// Public source reads only. No credentials, database writes or site requests.
const records = await probeWtsSources({
  profiles: manifest.profiles,
  feedUrl: manifest.feed.url,
  read: (url) => fetchSource(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) }),
});
for (const record of records) console.log(JSON.stringify(record));
if (process.env.WTS_DRIFT_OUTPUT) {
  await mkdir(dirname(process.env.WTS_DRIFT_OUTPUT), { recursive: true });
  await writeFile(
    process.env.WTS_DRIFT_OUTPUT,
    records.map((row) => JSON.stringify(row)).join('\n') + '\n',
  );
}
if (process.env.GITHUB_STEP_SUMMARY)
  await appendFile(process.env.GITHUB_STEP_SUMMARY, driftSummary(records));
if (records.some((record) => !record.ok)) process.exitCode = 1;
