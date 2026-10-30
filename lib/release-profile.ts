import { createHash } from 'node:crypto';
import { titleKey } from './film-identity';
import { text, dateFromText } from './sources';
import { profileReference, type ReportReference } from './reviewed-report-identities';
import type { MetadataEvidence } from './metadata';
import {
  sameReleaseTitle,
  runtimeMinutes,
  sharedSynopsisWords,
  closeDirector,
  type FilmFacts,
  profileFields,
  releaseSearchTitle,
  samePersonName,
} from './release-evidence';

export type SourceProfile = ReportReference & {
  directors: string[];
  cast: string[];
  overview: string;
  facts?: FilmFacts;
};

export class SourceProfileUnavailable extends Error {
  constructor(message = 'Release profile format changed') {
    super(message);
    this.name = 'SourceProfileUnavailable';
  }
}
export class SourceProfileConflict extends Error {
  constructor() {
    super('Source film identity changed');
    this.name = 'SourceProfileConflict';
  }
}

export function parseSourceProfile(html: string, reference: ReportReference): SourceProfile {
  const native = profileReference(html, reference.title, text);
  if (!native) throw new SourceProfileUnavailable();
  if (
    native.sourceFilmId !== reference.sourceFilmId ||
    native.sourceFilmUrl !== reference.sourceFilmUrl
  )
    throw new SourceProfileConflict();
  const fields = profileFields(html, text);
  const field = (label: string) => fields.get(label.toLowerCase())?.[0] || '';
  const directors = field('Director')
    .split(/,|\s+(?:and|&)\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);
  const cast = field('Cast')
    .split(/,|\s+with\s+|\s+and\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 30);
  const overview = field('Synopsis').slice(0, 4000);
  if (
    !directors.length ||
    !overview ||
    (!cast.length && !/\b(?:documentary|concert)\b/i.test(field('Genre')))
  )
    throw new SourceProfileUnavailable('Source film evidence incomplete');
  const runtime = runtimeMinutes(field('Runtime')),
    theatrical = dateFromText(field('Theater Date')) || undefined;
  const nonfiction = /\b(?:documentary|concert)\b/i.test(field('Genre'));
  const facts = {
    ...(runtime ? { runtime } : {}),
    ...(theatrical ? { theatrical } : {}),
    ...(nonfiction ? { nonfiction: true } : {}),
    ...(/\b(?:TV (?:Mini )?Series|Television|Episodes?)\b/i.test(field('Genre'))
      ? { series: true }
      : {}),
  };
  return { ...native, directors, cast, overview, ...(Object.keys(facts).length ? { facts } : {}) };
}
/** Display-year corrections do not change a known page's film when its identity-bearing content agrees. */
export function unchangedProfile(
  profile: SourceProfile,
  mapping: { year: string; profileFingerprint?: string },
) {
  return (
    !!mapping.profileFingerprint &&
    profileFingerprint({ ...profile, year: mapping.year }) === mapping.profileFingerprint
  );
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
  const sourceNames = profile.cast.map(titleKey),
    castField = ` ${sourceNames.join(' ')} `,
    cast = [...new Map(evidence.cast.map((name) => [titleKey(name), name])).values()].filter(
      (name) => {
        const key = titleKey(name);
        return (key.includes(' ') || sourceNames.includes(key)) && castField.includes(` ${key} `);
      },
    );
  const sourceSynopsis = titleKey(profile.overview),
    metadataSynopsis = titleKey(evidence.movie.overview || '');
  const [shorterSynopsis, longerSynopsis] = [sourceSynopsis, metadataSynopsis].sort(
    (a, b) => a.length - b.length,
  );
  return {
    title:
      sameReleaseTitle(profile.title, evidence.movie.title, profile.facts?.nonfiction) ||
      sameReleaseTitle(
        releaseSearchTitle(profile.title, profile.facts?.nonfiction, profile.directors),
        evidence.movie.title,
        profile.facts?.nonfiction,
      ),
    year: profile.year === evidence.movie.year,
    director: profile.directors.some((name) =>
      evidence.directors.some((other) => samePersonName(name, other)),
    ),
    closeDirector: profile.directors.some((name) =>
      evidence.directors.some((other) => closeDirector(name, other)),
    ),
    sharedSynopsis: sharedSynopsisWords(profile.overview, evidence.movie.overview || ''),
    runtime:
      !!profile.facts?.runtime &&
      !!evidence.facts?.runtime &&
      Math.abs(profile.facts.runtime - evidence.facts.runtime) <= 2,
    theatrical:
      !!profile.facts?.theatrical && profile.facts.theatrical === evidence.facts?.theatrical,
    // The source sometimes omits a comma between two actors. Match whole credited names,
    // never substrings inside names, against this film's bounded Cast field.
    cast: cast.filter(
      (name) =>
        !cast.some(
          (other) => other !== name && ` ${titleKey(other)} `.includes(` ${titleKey(name)} `),
        ),
    ),
    // A long exact synopsis supplies independent evidence when a source lists only a lead actor.
    synopsis:
      shorterSynopsis.length >= 120 &&
      shorterSynopsis.split(' ').length >= 20 &&
      ` ${longerSynopsis} `.includes(` ${shorterSynopsis} `),
  };
}
