import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { observationSummary } from '../lib/observations';
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(
    'Read-only retained WTS reliability report. npm run wts:health -- [--days 28] (1–45 days). No source requests or writes. Timing percentiles are fixed histogram upper bounds; null with overflow means beyond the largest bound.',
  );
  process.exit(0);
}
if (args.length && (args.length !== 2 || args[0] !== '--days')) throw new Error('Use --days 1–45');
const days = args.includes('--days') ? Number(args[args.indexOf('--days') + 1]) : 28;
if (!Number.isInteger(days) || days < 1 || days > 45) throw new Error('Choose 1–45 days');
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Server Supabase configuration is required');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
async function metricPages() {
  const rows: { day: string; fields: Record<string, number>; observed_at: string }[] = [];
  for (let offset = 0; offset < 5000; offset += 500) {
    const result = await db
      .from('a_list_observation_days')
      .select('day,generation,version,fields,observed_at')
      .gte('day', since)
      .order('day')
      .order('generation')
      .range(offset, offset + 499)
      .abortSignal(AbortSignal.timeout(10000));
    if (result.error) throw new Error('Retained observations unavailable');
    rows.push(...result.data);
    if (result.data.length < 500) return rows;
  }
  throw new Error('Observation report exceeds bounded generation limit; narrow --days');
}
async function healthPages() {
  const rows: { hour: string; snapshot: Record<string, unknown> }[] = [];
  for (let offset = 0; offset < 1500; offset += 500) {
    const result = await db
      .from('a_list_wts_health_history')
      .select('hour,snapshot')
      .gte('hour', since + 'T00:00:00Z')
      .order('hour')
      .range(offset, offset + 499)
      .abortSignal(AbortSignal.timeout(10000));
    if (result.error) throw new Error('Retained observations unavailable');
    rows.push(...result.data);
    if (result.data.length < 500) return rows;
  }
  throw new Error('Health report exceeds bounded retention limit');
}
const [metrics, health] = await Promise.all([metricPages(), healthPages()]);
const summary = observationSummary(metrics);
console.log(
  JSON.stringify(
    {
      requestedDays: days,
      since,
      retainedDays: [...new Set(metrics.map((row) => row.day))].length,
      latestCheckpointAt:
        metrics
          .map((row) => row.observed_at)
          .toSorted()
          .at(-1) || null,
      metricGenerations: metrics.length,
      percentileMeaning:
        'Upper bound of the containing fixed histogram bucket; these are not exact percentiles.',
      serverErrorRate: summary.counters.api_requests
        ? summary.counters.api_errors / summary.counters.api_requests
        : null,
      ...summary,
      hourlySnapshots: health,
      limitations: [
        'Only instrumented API routes are counted; this is not external uptime monitoring.',
        'Uncheckpointed samples can be lost during a Redis outage. No historical samples are backfilled.',
        'Hourly quality snapshots are point-in-time observations, not complete incident-duration measurements.',
        'Counters are approximate: a retried Redis operation can be counted twice. Freshness samples describe successful publication attempts and can repeat if a later checkpoint fails.',
      ],
    },
    null,
    2,
  ),
);
