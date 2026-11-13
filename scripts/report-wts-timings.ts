import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { timingSummary } from '../lib/release-timing';
const path = process.argv[2];
if (!path) throw new Error('Pass a JSONL runtime-log file. No network requests are made.');
const groups = new Map<string, number[]>();
const add = (name: string, value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return;
  const rows = groups.get(name) || [];
  if (rows.length < 50000) rows.push(value);
  groups.set(name, rows);
};
for await (const line of createInterface({ input: createReadStream(path), crlfDelay: Infinity })) {
  try {
    let row = JSON.parse(line);
    if (row.type === 'log') row = JSON.parse(row.data.message);
    if (row.event === 'release_lookup_timing')
      add(row.attempted ? 'lookup_source' : 'lookup_cached', row.durationMs);
    if (row.event === 'release_pipeline_timing') {
      add('discovered_to_published', row.queueLagMs);
      add('source_modified_to_published', row.sourceLagMs);
    }
    if (
      row.event === 'api_request' &&
      ['movie', 'catalogue', 'library', 'search', 'release_history'].includes(row.family) &&
      row.status >= 200 &&
      row.status < 300
    )
      add(
        row.family === 'movie' && row.mode === 'poll'
          ? 'background_detail_poll'
          : `visitor_${row.family}`,
        row.durationMs,
      );
  } catch {}
}
console.log(
  JSON.stringify(
    Object.fromEntries([...groups].map(([name, values]) => [name, timingSummary(values)])),
    null,
    2,
  ),
);
