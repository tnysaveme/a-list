import { createHash } from 'node:crypto';
import { titleKey } from './film-identity';
import { text } from './sources';
import { sourceAttribute, type ReportReference } from './reviewed-report-identities';
import type { MetadataEvidence } from './metadata';

export type SourceProfile = ReportReference & {
  directors: string[];
  cast: string[];
  overview: string;
};

export function parseSourceProfile(html: string, reference: ReportReference): SourceProfile {
  const native = html.match(/<article\b[^>]*\bid=['"]post-(\d+)['"][^>]*>/i)?.[1];
  const heading = text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '').match(
    /^(.*?)\s+\(((?:18|19|20)\d{2})\)$/,
  );
  const canonical = [...html.matchAll(/<link\b[^>]*>/gi)].find(
    (link) => sourceAttribute(link[0], 'rel') === 'canonical',
  );
  if (
    native !== reference.sourceFilmId ||
    !heading ||
    titleKey(heading[1]) !== titleKey(reference.title) ||
    heading[2] !== reference.year ||
    !canonical ||
    sourceAttribute(canonical[0], 'href') !== reference.sourceFilmUrl
  )
    throw new Error('Source film identity changed');
  const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((match) =>
    text(match[1]),
  );
  const field = (label: string) =>
    paragraphs
      .find((p) => p.startsWith(`${label}:`))
      ?.slice(label.length + 1)
      .trim() || '';
  const directors = field('Director')
    .split(/,|\s+and\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);
  const cast = field('Cast')
    .split(/,|\s+with\s+|\s+and\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 30);
  const overview = field('Synopsis').slice(0, 4000);
  if (!directors.length || !cast.length || !overview)
    throw new Error('Source film evidence incomplete');
  return { ...reference, title: heading[1], directors, cast, overview };
}
export function profileFingerprint(profile: SourceProfile): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        id: profile.sourceFilmId,
        url: profile.sourceFilmUrl,
        title: titleKey(profile.title),
        year: profile.year,
        directors: profile.directors.map(titleKey).sort(),
        cast: profile.cast.map(titleKey).sort(),
        overview: profile.overview.normalize('NFKC').trim(),
      }),
    )
    .digest('hex');
}
export function evidenceAgreement(profile: SourceProfile, evidence: MetadataEvidence) {
  const directors = new Set(evidence.directors.map(titleKey)),
    cast = new Set(evidence.cast.map(titleKey));
  return {
    title: titleKey(profile.title) === titleKey(evidence.movie.title),
    year: profile.year === evidence.movie.year,
    director: profile.directors.some((name) => directors.has(titleKey(name))),
    cast: profile.cast.filter((name) => cast.has(titleKey(name))),
  };
}
