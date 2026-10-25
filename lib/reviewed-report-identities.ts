import {titleKey} from './film-identity';

export type ReviewedReportIdentity = {
  sourceFilmId: string;
  sourceFilmUrl: string;
  title: string;
  year: string;
  imdbId: string;
  reviewedAt: string;
  method?: 'reviewed'|'corroborated'|'structured';
  profileFingerprint?: string;
  evidence: {metadata: string; releaseSource: string; corroboration: string};
};

/** Explicitly reviewed crosswalks, never generated from search results at runtime.
 * Add a record only after reviewing the source film page, director/cast/plot,
 * and the independent release source's explicit IMDb sameAs identity.
 */
export const reviewedReportIdentities: readonly ReviewedReportIdentity[] = [
  {
    sourceFilmId: '31669',
    sourceFilmUrl: 'https://whentostream.com/the-isolate-thief-2026/',
    title: 'The Isolate Thief', year: '2026', imdbId: 'tt35051162',
    reviewedAt: '2026-10-24T18:48:00Z',
    evidence: {
      metadata: 'https://v3-cinemeta.strem.io/meta/movie/tt35051162.json',
      releaseSource: 'https://www.dvdsreleasedates.com/movies/12877/the-isolate-thief',
      corroboration: 'Source page 31669 and metadata agree on John Suits, Sean Bean, Joe Pantoliano, and the stolen-gold/outpost plot. The release source explicitly identifies tt35051162.',
    },
  },
  {
    sourceFilmId: '21148',
    sourceFilmUrl: 'https://whentostream.com/gail-daughtry-and-the-celebrity-sex-pass-2026/',
    title: 'Gail Daughtry and the Celebrity Sex Pass', year: '2026', imdbId: 'tt36834010',
    reviewedAt: '2026-10-24T18:48:00Z',
    evidence: {
      metadata: 'https://v3-cinemeta.strem.io/meta/movie/tt36834010.json',
      releaseSource: 'https://www.dvdsreleasedates.com/movies/12809/gail-daughtry-and-the-celebrity-sex-pass',
      corroboration: 'Source page 21148 and metadata agree on David Wain, Zoey Deutch, and the Midwestern bride/celebrity-pass plot. The release source explicitly identifies tt36834010.',
    },
  },
];

export const sourceAttribute = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'))?.[2];
const attribute=sourceAttribute;

export type ReportReference={sourceFilmId:string;sourceFilmUrl:string;title:string;year:string};
export function reportReference(html:string,title:string,readText:(html:string)=>string):ReportReference|undefined{
  const opening=html.match(/itemprop=['"]articleBody['"][^>]*>([\s\S]*?)<\/p>/i)?.[1];
  if(!opening)return;
  const links=[...opening.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].filter(link=>titleKey(readText(link[2]))===titleKey(title));
  if(links.length!==1)return;
  const attrs=` ${links[0][1]}`,id=attribute(attrs,'data-id'),href=attribute(attrs,'href');
  if(attribute(attrs,'data-type')!=='page'||!id||!/^\d{1,10}$/.test(id)||!href)return;
  try{const url=new URL(href);if(url.protocol!=='https:'||url.hostname!=='whentostream.com'||url.port||url.username||url.password||url.search||url.hash||!/^\/[a-z0-9-]+\/$/.test(url.pathname))return;}catch{return;}
  const widgets=[...html.matchAll(/<div\b[^>]*\bdata-jw-widget\b[^>]*>/gi)];
  if(widgets.length>1)return;
  const widget=widgets[0]?.[0];
  // A slug year shortlists a native profile; parseSourceProfile must verify its heading.
  const year=widget?attribute(widget,'data-year'):href.match(/-((?:18|19|20)\d{2})\/$/)?.[1];
  if(!year||!/^(18|19|20)\d{2}$/.test(year)||widget&&(attribute(widget,'data-object-type')!=='movie'||titleKey(readText(attribute(widget,'data-title')||''))!==titleKey(title)))return;
  return {sourceFilmId:id,sourceFilmUrl:href,title:widget?readText(attribute(widget,'data-title')!):title,year};
}

/** A reviewed page ID must be the linked subject in the opening paragraph.
 * Widgets, when present, must corroborate title/year. They never supply identity.
 */
export function reviewedReportIdentity(html: string, title: string, readText: (html: string) => string,identities:readonly ReviewedReportIdentity[]=reviewedReportIdentities): ReviewedReportIdentity | undefined {
  const reference=reportReference(html,title,readText);if(!reference)return;
  const mappings=identities.filter(mapping=>mapping.sourceFilmId===reference.sourceFilmId&&mapping.sourceFilmUrl===reference.sourceFilmUrl&&mapping.year===reference.year&&titleKey(mapping.title)===titleKey(reference.title));
  return mappings.length===1?mappings[0]:undefined;
}
