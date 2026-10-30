import { titleKey } from './film-identity';

export type FilmFacts = {
  runtime?: number;
  theatrical?: string;
  nonfiction?: boolean;
  series?: boolean;
};

/** Exact complete name tokens, including surname-first order and hyphenated given names. */
export function samePersonName(a: string, b: string) {
  const keys = (value: string) =>
    [value, value.replace(/[-‐‑–]/g, '')].map((name) =>
      titleKey(name).split(' ').filter(Boolean).sort().join(' '),
    );
  const left = keys(a),
    right = keys(b);
  return left.some((key) => !!key && right.includes(key));
}

/** WordPress uses both separate paragraphs and line breaks for the same labelled fields. */
export function profileFields(html: string, readText: (html: string) => string) {
  const body = html.match(/<article\b[^>]*>[\s\S]*?<\/article>/i)?.[0] || '';
  const fields = new Map<string, string[]>();
  for (const paragraph of body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    let active: string | undefined;
    for (const part of paragraph[1].split(/<br\s*\/?>/gi)) {
      const line = readText(part);
      const match = line.match(
        /^(Rating|Runtime|Theater Date|Genre|Director|Cast|Distributor|Synopsis|(?:VOD|PVOD|SVOD) Release Date)\s*:\s*(.*)$/i,
      );
      if (match) {
        active = match[1].toLowerCase();
        const values = fields.get(active) || [];
        values.push(match[2]);
        fields.set(active, values);
      } else if (active && line) {
        const values = fields.get(active)!;
        values[values.length - 1] += (['cast', 'director'].includes(active) ? ', ' : ' ') + line;
      }
    }
  }
  return fields;
}

/** Presentation labels can differ; sequel numbers and ordinary subtitles remain significant. */
function presentationTitle(title: string, concert: boolean) {
  return title
    .replace(/\s*\((?:live in )?3d\)\s*$/i, '')
    .replace(
      /\s+(?:\d+(?:st|nd|rd|th) anniversary|(?:4k|digital) restoration)(?:\s+(?:4k|digital) restoration)?\s*$/i,
      '',
    )
    .replace(concert ? /\s*[:–—-]\s*the tour\s*$/i : /$^/, '')
    .trim();
}
export function sameReleaseTitle(a: string, b: string, concert = false) {
  const left = presentationTitle(a, concert),
    right = presentationTitle(b, concert);
  if (titleKey(left) === titleKey(right)) return true;
  // An edition page may put its director's possessive credit before the original title.
  const edition = (original: string, stripped: string, other: string) =>
    /\b(?:anniversary|restoration)\b/i.test(original) &&
    titleKey(stripped.replace(/^.*?['’]s\s+/i, '')) === titleKey(other);
  return edition(a, left, right) || edition(b, right, left);
}
export function releaseSearchTitle(title: string, concert = false, directors: string[] = []) {
  const stripped = presentationTitle(title, concert);
  const credit = stripped.match(/^(.*?)['’]s\s+(.*)$/i);
  return credit && directors.some((director) => titleKey(director) === titleKey(credit[1]))
    ? credit[2]
    : stripped;
}

export function runtimeMinutes(value: string): number | undefined {
  const match = value.trim().match(/^(\d{1,3})(?:\s*(?:min(?:ute)?s?))?$/i);
  const minutes = match ? Number(match[1]) : 0;
  return minutes > 0 && minutes < 600 ? minutes : undefined;
}

const uninformative = new Set(
  'about after along also been before being between during every features film follows from have into life lost more movie never over side some story tells than that their them there these they this through together told very what when where which while with world years'.split(
    ' ',
  ),
);
export function sharedSynopsisWords(a: string, b: string) {
  const words = (value: string) =>
    new Set(
      titleKey(value)
        .split(' ')
        .filter((word) => word.length >= 4 && !uninformative.has(word)),
    );
  const left = words(a),
    right = words(b);
  return [...left].filter((word) => right.has(word)).length;
}

/** One insertion/deletion/substitution in the given name, with the surname unchanged. */
export function closeDirector(a: string, b: string) {
  const left = titleKey(a).split(' '),
    right = titleKey(b).split(' ');
  if (
    left.length !== right.length ||
    left.length < 2 ||
    left.slice(1).join(' ') !== right.slice(1).join(' ')
  )
    return false;
  let x = left[0],
    y = right[0];
  if (x === y) return true;
  if (Math.abs(x.length - y.length) > 1) return false;
  if (x.length > y.length) [x, y] = [y, x];
  let i = 0;
  while (i < x.length && x[i] === y[i]) i++;
  return x.length === y.length ? x.slice(i + 1) === y.slice(i + 1) : x.slice(i) === y.slice(i + 1);
}
