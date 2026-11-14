import type { Release } from './model';
import { profileReference } from './reviewed-report-identities';
import { parseSourceProfile } from './release-profile';
import { profileReleaseEvidence, parseReports, text } from './sources';
import { sourceIssue } from './source-errors';
import type { SourceIssue } from './model';
export type WtsProfileExpectation = {
  url: string;
  title: string;
  sourceId: string;
  expectedKinds?: Release['kind'][];
};
export function inspectWtsProfile(html: string, expected: WtsProfileExpectation) {
  const reference = profileReference(html, expected.title, text);
  if (
    !reference ||
    reference.sourceFilmUrl !== expected.url ||
    reference.sourceFilmId !== expected.sourceId
  )
    throw new Error('WTS profile subject identity changed');
  const profile = parseSourceProfile(html, reference);
  const evidence = profileReleaseEvidence(html, reference);
  const missingKinds = (expected.expectedKinds || []).filter((kind) =>
    evidence.absentKinds.includes(kind),
  );
  if (evidence.malformedKinds.length || evidence.absentKinds.length === 3 || missingKinds.length)
    throw new WtsFieldDrift(missingKinds, evidence.malformedKinds);
  return { profile, evidence };
}
export function inspectWtsFeed(xml: string) {
  if (!/<rss\b/i.test(xml) || !/<channel\b/i.test(xml) || !/<item\b/i.test(xml))
    throw new Error('WTS feed structure changed');
  const reports = parseReports(xml);
  if (!reports.length) throw new Error('WTS feed has no recognizable release reports');
  return reports;
}

export class WtsFieldDrift extends Error {
  constructor(
    readonly missingKinds: Release['kind'][],
    readonly malformedKinds: Release['kind'][],
  ) {
    super('WTS release fields changed');
  }
}

/** Three permanent subjects plus two rotating subjects; no unbounded source crawl. */
export function selectWtsProfiles(profiles: WtsProfileExpectation[], now = Date.now()) {
  const anchors = profiles.slice(0, 3);
  const rotating = profiles.slice(3, 23);
  const offset = Math.floor(now / 86400000) % Math.max(1, rotating.length);
  return [
    ...anchors,
    ...Array.from(
      { length: Math.min(2, rotating.length) },
      (_, i) => rotating[(offset + i) % rotating.length],
    ),
  ];
}

export type WtsDriftRecord = {
  event: 'wts_drift_check' | 'wts_feed_drift_check';
  sourceId?: string;
  checkedAt: string;
  ok: boolean;
  attempts: number;
  confirmed: boolean;
  recovered?: boolean;
  windows?: number;
  reports?: number;
  category?: SourceIssue['category'];
  status?: number;
  missingKinds?: Release['kind'][];
  malformedKinds?: Release['kind'][];
};

/** Retry a failed public-source probe once. Two workers cap network concurrency. */
export async function probeWtsSources({
  profiles,
  feedUrl,
  read,
  now = Date.now(),
}: {
  profiles: WtsProfileExpectation[];
  feedUrl: string;
  read: (url: string) => Promise<string>;
  now?: number;
}): Promise<WtsDriftRecord[]> {
  const selected = selectWtsProfiles(profiles, now);
  const jobs = [
    ...selected.map((profile) => ({
      sourceId: profile.sourceId,
      event: 'wts_drift_check' as const,
      run: async () => ({
        windows: inspectWtsProfile(await read(profile.url), profile).evidence.reports.length,
      }),
    })),
    {
      event: 'wts_feed_drift_check' as const,
      run: async () => ({ reports: inspectWtsFeed(await read(feedUrl)).length }),
    },
  ];
  const results: WtsDriftRecord[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(2, jobs.length) }, async () => {
      while (next < jobs.length) {
        const index = next++,
          job = jobs[index];
        for (let attempts = 1; attempts <= 2; attempts++) {
          const base = {
            event: job.event,
            ...('sourceId' in job ? { sourceId: job.sourceId } : {}),
            checkedAt: new Date(now).toISOString(),
            attempts,
          };
          try {
            results[index] = {
              ...base,
              ...(await job.run()),
              ok: true,
              confirmed: false,
              ...(attempts === 2 ? { recovered: true } : {}),
            };
            break;
          } catch (error) {
            if (attempts < 2) continue;
            const issue = sourceIssue(error, 'wts');
            results[index] = {
              ...base,
              ok: false,
              confirmed: true,
              category: issue.category,
              ...(issue.status ? { status: issue.status } : {}),
              ...(error instanceof WtsFieldDrift
                ? { missingKinds: error.missingKinds, malformedKinds: error.malformedKinds }
                : {}),
            };
          }
        }
      }
    }),
  );
  return results;
}

export function driftSummary(records: WtsDriftRecord[]) {
  return [
    '## WTS public-source checks',
    '',
    '| Subject | Result | Attempts | Detail |',
    '| --- | --- | --- | --- |',
    ...records.map(
      (record) =>
        `| ${record.sourceId || 'RSS feed'} | ${record.ok ? (record.recovered ? 'Recovered on retry' : 'Passed') : 'Confirmed failure'} | ${record.attempts} | ${record.category || 'Recognized source fields'}${record.missingKinds?.length ? `; missing: ${record.missingKinds.join(', ')}` : ''}${record.malformedKinds?.length ? `; malformed: ${record.malformedKinds.join(', ')}` : ''} |`,
    ),
    '',
    'Each failed check is retried once. Confirmed failures fail the workflow; dates may legitimately change. JSONL contains public source IDs and safe categories only.',
    '',
  ].join('\n');
}
