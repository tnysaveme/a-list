import { profileReference } from './reviewed-report-identities';
import { parseSourceProfile } from './release-profile';
import { profileReleaseEvidence, parseReports, text } from './sources';
export function inspectWtsProfile(
  html: string,
  expected: { url: string; title: string; sourceId: string },
) {
  const reference = profileReference(html, expected.title, text);
  if (
    !reference ||
    reference.sourceFilmUrl !== expected.url ||
    reference.sourceFilmId !== expected.sourceId
  )
    throw new Error('WTS profile subject changed');
  const profile = parseSourceProfile(html, reference);
  const evidence = profileReleaseEvidence(html, reference);
  if (evidence.malformedKinds.length || evidence.absentKinds.length === 3)
    throw new Error('WTS release fields changed');
  return { profile, evidence };
}
export function inspectWtsFeed(xml: string) {
  if (!/<rss\b/i.test(xml) || !/<channel\b/i.test(xml) || !/<item\b/i.test(xml))
    throw new Error('WTS feed structure changed');
  const reports = parseReports(xml);
  if (!reports.length) throw new Error('WTS feed has no recognizable release reports');
  return reports;
}
