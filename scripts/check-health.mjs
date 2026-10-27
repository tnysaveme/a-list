import { readFile, writeFile, mkdir } from 'node:fs/promises';
const target = process.env.ALIST_STATUS_URL || 'https://a-list-nine.vercel.app/api/status';
const url = new URL(target);
if (url.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(url.hostname))
  throw Error('Health checks require HTTPS or loopback');
let status = 'degraded',
  httpStatus = 0;
try {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error' });
  httpStatus = response.status;
  const value = await response.json();
  if (response.ok && value.status === 'healthy') status = 'healthy';
} catch {}
const path = 'outputs/health-state.json';
let previous;
try {
  previous = JSON.parse(await readFile(path, 'utf8')).status;
} catch {}
if (previous !== status)
  console.log(
    JSON.stringify({
      event:
        status === 'healthy'
          ? previous
            ? 'source_health_recovered'
            : 'source_health_initialized'
          : 'source_health_degraded',
      httpStatus,
      checkedAt: new Date().toISOString(),
    }),
  );
await mkdir('outputs', { recursive: true });
await writeFile(path, JSON.stringify({ status }));
// Logs-only policy: degraded health is an event, not an unsolicited CI-failure notification.
