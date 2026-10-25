import type { Movie, Release } from './model';
import {titleKey,verifiedIdentityId} from './film-identity';
import {assertListingSource,listingImdbId,structuredFilmIdentity} from './source-identity';
import {sourceAttribute,reviewedReportIdentity,type ReviewedReportIdentity} from './reviewed-report-identities';
export type ReleaseReport = {title: string; year?: string; publishedAt?:string; imdbId?: string; identityVerifiedAt?: string; release: Release};
const BASE = 'https://www.dvdsreleasedates.com';
export function text(html: string): string {
  const accents:Record<string,string>={aacute:'á',eacute:'é',iacute:'í',oacute:'ó',uacute:'ú',agrave:'à',egrave:'è',igrave:'ì',ograve:'ò',ugrave:'ù',auml:'ä',euml:'ë',iuml:'ï',ouml:'ö',uuml:'ü',ntilde:'ñ',ccedil:'ç',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',hellip:'…'};
  return html.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,' ').replace(/&#x([\da-f]+);/gi,(_,x)=>{const n=parseInt(x,16);return n<=0x10ffff?String.fromCodePoint(n):'';}).replace(/&#(\d+);/g,(_,x)=>Number(x)<=0x10ffff?String.fromCodePoint(Number(x)):'').replace(/&([a-z]+);/gi,(whole,key:string)=>{const decoded=accents[key.toLowerCase()];return decoded?(key[0]===key[0].toUpperCase()?decoded.toUpperCase():decoded):whole;}).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/&mdash;/g,'—').replace(/&ndash;/g,'–').replace(/\s+/g,' ').trim();
}
const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export function dateFromText(input: string): string | null {
 const m = text(input).match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})/i);
 if (!m) return null;
 const result = `${m[3]}-${String(months.findIndex(x=>x.toLowerCase()===m[1].toLowerCase())+1).padStart(2,'0')}-${m[2].padStart(2,'0')}`;
 const parsed=new Date(`${result}T12:00:00Z`);
 return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10) === result ? result : null;
}
export function parseListing(html: string, digital: boolean, checkedAt = new Date().toISOString()): Movie[] {
 const movies: Movie[] = []; let date: string | null = null;
 const parts = html.split(/(?=<td[^>]*class=['"](?:reldate|dvdcell)\b)/i);
 for (const part of parts) {
   if (/^<td[^>]*class=['"]reldate\b/i.test(part)) { date = dateFromText(part.slice(0,250)); continue; }
   const path = part.match(/href=['"](\/movies\/\d+\/[^'"]+)['"]/i)?.[1];
   const image = part.match(/<img[^>]*src=['"]([^'"]*\/posters\/[^'"]+)['"]/i)?.[1];
   const alt = part.match(/<img[^>]*alt=['"]([^'"]+)['"]/i)?.[1];
   if (!path || !image || !alt) continue;
   const id = path.match(/\/movies\/(\d+)/)![1];
   const source = BASE + path;
   const title = text(alt).replace(/\s*(?:\(\d{4}\))?\s*DVD Release Date.*$/i,'').trim();
   const poster = new URL(image.replace('/110/','/300/'),BASE).href;
   const year = image.match(/-(20\d{2}|19\d{2})(?:-movie-poster)?\.jpg/i)?.[1] || path.match(/\((18\d{2}|19\d{2}|20\d{2})\)/)?.[1] || '';
   const rating = part.match(/imdblink right['"]>([^<]+)/)?.[1];
   movies.push({id,title,year,poster,source,rating:rating?text(rating):undefined,checkedAt,theatrical:!digital&&date?date:undefined,releases:digital&&date?[{kind:'Digital',date,confidence:'listed',source,sourceName:'DVDs Release Dates',checkedAt}]:[]});
 }
 return [...new Map(movies.map(m=>[m.id,m])).values()];
}
/** Exact searches can redirect to a native detail page instead of a results list. */
export function parseSearchResults(html:string,checkedAt=new Date().toISOString()):Movie[]{
 const results=html.split(/<div\b[^>]*\bid=['"]rightcolumn['"]/i)[0];
 const canonical=[...results.matchAll(/<link\b[^>]*>/gi)].find(link=>sourceAttribute(link[0],'rel')==='canonical');
 const source=canonical?sourceAttribute(canonical[0],'href'):undefined;
 if(source){
  const url=new URL(source),id=url.pathname.match(/^\/movies\/(\d{1,8})\/[^/]+\/?$/)?.[1];
  if(id){
   if(url.protocol!=='https:'||url.hostname!=='www.dvdsreleasedates.com'||url.port||url.username||url.password||url.search||url.hash)throw new Error('Search source identity mismatch');
   const headings=[...results.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
   const heading=headings.length===1?text(headings[0][1]).match(/^(.*?)\s+\(\s*((?:18|19|20)\d{2})\s*\)$/):null;
   if(!heading)throw new Error('Search detail format changed');
   const image=[...results.matchAll(/<img\b[^>]*>/gi)].find(image=>sourceAttribute(image[0],'itemprop')==='image');
   const imagePath=image?sourceAttribute(image[0],'src'):undefined;
   const poster=imagePath?new URL(imagePath,BASE).href:'';
   return [parseDetail(results,{id,title:heading[1],year:heading[2],source,poster,checkedAt,releases:[]},checkedAt)];
  }
 }
 if(/<td\b[^>]*class=['"]dvdcell\b/i.test(results))return parseListing(results.slice(results.search(/<td\b[^>]*class=['"]dvdcell\b/i)),false,checkedAt);
 if(/no (?:search )?results|no movies (?:found|match)/i.test(text(results)))return [];
 throw new Error('Search results format changed');
}
export function parseDetail(html: string, movie: Movie, checkedAt = new Date().toISOString()): Movie {
 assertListingSource(movie);
 const heading = text(html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] || '');
 if(!/\b(?:Digital HD|(?:DVD|Blu-ray)(?: and Blu-ray)? release(?: date)?|(?:digital|home) release date)\b/i.test(heading))throw new Error('Movie source format changed');
 const digital = heading.match(/Digital HD[\s\S]*?\bon\s+(.+)/i);
 const date = digital ? dateFromText(digital[1]) : null;
 // Only the Digital HD statement counts. DVD and theatrical dates are never substituted.
 const overview = parseSynopsis(html);
 const releases: Release[] = movie.releases.filter(r=>r.kind==='Subscription'||(!date&&r.sourceName==='When To Stream'));
 if (date) releases.push({kind:'Digital',date,confidence:'listed',source:movie.source,sourceName:'DVDs Release Dates',checkedAt});
 const sourceId=listingImdbId(html),expectedId=verifiedIdentityId(movie);
 if(expectedId&&sourceId!==expectedId)throw new Error('Film source identity mismatch');
 if(!date&&!expectedId&&movie.releases.some(r=>r.sourceName==='DVDs Release Dates')){
  const canonical=[...html.matchAll(/<link\b[^>]*>/gi)].find(link=>sourceAttribute(link[0],'rel')==='canonical');
  const href=canonical?sourceAttribute(canonical[0],'href'):undefined;
  const subject=text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'').match(/^(.*?)\s+\(\s*(?:18|19|20)\d{2}\s*\)$/);
  let sameNative=false;
  try{const url=new URL(href||''),original=new URL(movie.source);sameNative=url.protocol==='https:'&&url.hostname===original.hostname&&!url.port&&!url.search&&!url.hash&&!url.username&&!url.password&&/^\/movies\/\d{1,8}\/[^/]+\/?$/.test(url.pathname)&&url.pathname.split('/')[2]===original.pathname.split('/')[2];}catch{}
  if(!sameNative||!subject||titleKey(subject[1])!==titleKey(movie.title))throw new Error('Movie source subject not verified');
 }
 const imdbId=sourceId;
 const repaired=!!sourceId&&!!movie.imdbId&&sourceId!==movie.imdbId;
 return {...movie,imdbId,identityVerifiedAt:imdbId?checkedAt:undefined,
  ...(repaired?{metadataCheckedAt:undefined,synopsisCheckedAt:undefined}:{}),
  overview:overview||(!repaired?movie.overview:undefined),overviewSource:overview?movie.source:!repaired?movie.overviewSource:undefined,
  releaseCheckedAt:checkedAt,checkedAt,releases};
}
export function parseSynopsis(html:string):string|undefined{
 const content=html.match(/<([a-z][\w:-]*)\b[^>]*\bitemprop=['"]description['"][^>]*>([\s\S]*?)<\/\1>/i)?.[2];
 if(content){const overview=text(content);if(overview)return overview.slice(0,4000);}
 for(const script of html.matchAll(/<script\b[^>]*type=['"]application\/ld\+json['"][^>]*>([\s\S]*?)<\/script>/gi)){
  try{
   const root=JSON.parse(script[1]);const items=Array.isArray(root)?root:root['@graph']||[root];
   for(const item of items)if((item['@type']==='Movie'||Array.isArray(item['@type'])&&item['@type'].includes('Movie'))&&typeof item.description==='string')return text(item.description).slice(0,4000)||undefined;
  }catch{}
 }
 return undefined;
}
export function parseReports(xml: string): ReleaseReport[] {
 const result: ReleaseReport[]=[];
 for (const item of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
   const title = text(item[1].match(/<title>([\s\S]*?)<\/title>/)?.[1]||'');
   const description = text(item[1].match(/<description>([\s\S]*?)<\/description>/)?.[1]||'');
   const source = text(item[1].match(/<link>([\s\S]*?)<\/link>/)?.[1]||'');
   const film = title.match(/(?<![\p{L}\p{N}])([\p{Lu}][\p{Lu}\p{M}0-9 ’':,!?.&-]{2,}?)\s+(?:Sets|Gets|Digital|Streaming)/u)?.[1];
   const date = reportDate(description,title);
   if (!film || !date || !source.startsWith('https://whentostream.com/')) continue;
   const platform = reportPlatform(description);
   if(!platform&&/\bSVOD\b|subscription/i.test(description))continue;
   const publishedAt=text(item[1].match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]||'')||undefined;
   result.push({title:film,publishedAt,release:{date,kind:platform?'Subscription':/PVOD/i.test(description)?'PVOD':'Digital',platform,confidence:/according to our sources|expected|not confirmed|neither announced/i.test(description)?'rumored':'listed',source,sourceName:'When To Stream',checkedAt:new Date().toISOString()}});
 }
 return result;
}
export const normalized = (s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
const reportPlatform=(description:string)=>{
 const arriving=description.match(/\b(?:arriving|(?:will )?begin streaming|streaming|(?:will )?launch|(?:will )?premiere|(?:will )?debut) on (HBO Max|Netflix|Shudder|Hulu|Peacock|Disney\+|Prime Video|Paramount\+|MGM\+|Apple TV\+?)(?=\W|$)/i)?.[1];
 if(arriving)return arriving;
 // Some original-film announcements name the service first, then refer to its platform.
 const original=description.match(/^(Netflix|Shudder|Hulu|Peacock|Disney\+|Prime Video|Paramount\+|MGM\+|Apple TV\+?)(?=\W|$)[\s\S]*?\b(?:will launch|will begin streaming|premieres?|debuts?) on (?:their|its) platform on\b/i)?.[1];
 return original;
};
/** Bind each date to its nearest release context, rather than a trailer's cinema date. */
function reportDate(description:string,headline:string):string|null {
 const dates=[...description.matchAll(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+20\d{2}/gi)];
 const service=reportPlatform(description);
 let previousEnd=0;
 for(const date of dates){
  const context=description.slice(previousEnd,date.index);previousEnd=date.index!+date[0].length;
  const markers=[...context.matchAll(/\b(digital|pvod|tvod|svod|vod|streaming|subscription|platform|theaters?|theatres?|theatrical|cinemas?|dvd|blu[ -]?ray|physical)\b/gi)];
  const last=markers.at(-1)?.[1];
  const home=last?/^(digital|pvod|tvod|svod|vod|streaming|subscription|platform)$/i.test(last)&&(last.toLowerCase()!=='platform'||!!service||/\b(digital|pvod|tvod|svod|vod)\b/i.test(context)):
   !!reportPlatform(context)||dates.length===1&&/\b(digital|streaming|pvod|tvod|svod|vod)\b/i.test(headline);
  if(home)return dateFromText(date[0]);
 }
 return null;
}
export function parseReportDetail(html:string,release:Release):Release|null {
 const body=html.match(/itemprop=['"]articleBody['"][^>]*>([\s\S]*?)<\/p>/i)?.[1];
 const meta=html.match(/property=['"]og:description['"][^>]*content=(["'])([\s\S]*?)\1/i)?.[2];
 const description=text(body||meta||'');
 const headline=text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||new URL(release.source).pathname.replace(/-/g,' '));
 const date=reportDate(description,headline);
 if(!description)throw new Error('Release report format changed');
 if(!date||/no longer|withdrawn|postponed|no date|cancelled|canceled/i.test(description))return null;
 const platform=reportPlatform(description);
 if(!platform&&/\bSVOD\b|subscription/i.test(description))return null;
 return {...release,...(platform?{kind:'Subscription' as const,platform}:{}),date,confidence:/according to our sources|expected|not confirmed|neither announced/i.test(description)?'rumored':'listed',checkedAt:new Date().toISOString()};
}
export function parseVerifiedReport(html: string, report: ReleaseReport,identities?:readonly ReviewedReportIdentity[]): ReleaseReport | null {
 try{const url=new URL(report.release.source);if(url.protocol!=='https:'||url.hostname!=='whentostream.com'||report.release.sourceName!=='When To Stream')return null;}catch{return null;}
 const structured=structuredFilmIdentity(html,report.title);
 if(structured.ambiguous)return null;
 const reviewed=reviewedReportIdentity(html,report.title,text,identities);
 if(structured.imdbId&&reviewed&&structured.imdbId!==reviewed.imdbId)return null;
 // Structured provenance belongs to this article's explicit Movie data, not a cached crosswalk.
 if(!structured.imdbId&&reviewed?.method==='structured')return null;
 const subject=structured.imdbId?structured:reviewed;
 // A release year in article copy is never the film's production year.
 if(!subject?.imdbId)return null;
 if(report.imdbId&&report.imdbId!==subject.imdbId)return null;
 if(report.year&&subject.year&&report.year!==subject.year)return null;
 const release=parseReportDetail(html,report.release);
 return release?{...report,imdbId:subject.imdbId,year:subject.year,identityVerifiedAt:release.checkedAt,
  release:{...release,filmImdbId:subject.imdbId,filmIdentityMethod:structured.imdbId?'structured':reviewed!.method||'reviewed',filmIdentitySource:structured.imdbId?report.release.source:reviewed!.sourceFilmUrl}}:null;
}
export async function fetchSource(url: string, init?: RequestInit): Promise<string> {
 const u = new URL(url);
 if (!['www.dvdsreleasedates.com','whentostream.com'].includes(u.hostname) || u.protocol!=='https:') throw new Error('Unsupported movie source');
 const cacheOptions=init?.cache!=='no-store'&&(!init?.method||init.method==='GET')?{next:{revalidate:21600}}:{};
 const signal=init?.signal?AbortSignal.any([init.signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000);
 const response = await fetch(url,{...cacheOptions,...init,signal,headers:{'User-Agent':'A-List/1.0 (personal US movie release tracker)',...init?.headers}});
 if (!response.ok) throw new Error(`Release source returned ${response.status}`);
 const body = await response.text();
 if (body.length<500 || body.length>2_000_000) throw new Error('Unexpected release source response');
 return body;
}
