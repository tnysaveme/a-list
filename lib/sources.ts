import type { Movie, Release } from './model';
const BASE = 'https://www.dvdsreleasedates.com';
export function text(html: string): string {
  const accents:Record<string,string>={aacute:'á',eacute:'é',iacute:'í',oacute:'ó',uacute:'ú',agrave:'à',egrave:'è',igrave:'ì',ograve:'ò',ugrave:'ù',auml:'ä',euml:'ë',iuml:'ï',ouml:'ö',uuml:'ü',ntilde:'ñ',ccedil:'ç',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',hellip:'…'};
  return html.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,' ').replace(/&#x([\da-f]+);/gi,(_,x)=>{const n=parseInt(x,16);return n<=0x10ffff?String.fromCodePoint(n):'';}).replace(/&#(\d+);/g,(_,x)=>Number(x)<=0x10ffff?String.fromCodePoint(Number(x)):'').replace(/&([a-z]+);/gi,(whole,key)=>accents[key]||whole).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/&mdash;/g,'—').replace(/&ndash;/g,'–').replace(/\s+/g,' ').trim();
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
export function parseDetail(html: string, movie: Movie, checkedAt = new Date().toISOString()): Movie {
 const heading = text(html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] || '');
 if(!heading)throw new Error('Movie source format changed');
 const digital = heading.match(/Digital HD[\s\S]*?\bon\s+(.+)/i);
 const date = digital ? dateFromText(digital[1]) : null;
 // Only the Digital HD statement counts. DVD and theatrical dates are never substituted.
 const overview = parseSynopsis(html);
 const releases: Release[] = movie.releases.filter(r=>r.kind==='Subscription'||(!date&&r.sourceName==='When To Stream'));
 if (date) releases.push({kind:'Digital',date,confidence:'listed',source:movie.source,sourceName:'DVDs Release Dates',checkedAt});
 const imdbId=html.match(/imdb\.com\/title\/(tt\d{7,10})\b/i)?.[1]||movie.imdbId;
 return {...movie,imdbId,overview:overview||movie.overview,overviewSource:overview?movie.source:movie.overviewSource,releaseCheckedAt:checkedAt,checkedAt,releases};
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
export function parseReports(xml: string): {title:string;release:Release}[] {
 const result: {title:string;release:Release}[]=[];
 for (const item of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
   const title = text(item[1].match(/<title>([\s\S]*?)<\/title>/)?.[1]||'');
   const description = text(item[1].match(/<description>([\s\S]*?)<\/description>/)?.[1]||'');
   const source = text(item[1].match(/<link>([\s\S]*?)<\/link>/)?.[1]||'');
   const film = title.match(/\b([A-Z][A-Z0-9 ’':,!?.&-]{2,}?)\s+(?:Sets|Gets|Digital|Streaming)/)?.[1];
   const date = dateFromText(description);
   if (!film || !date || !source.startsWith('https://whentostream.com/')) continue;
   const platform = description.match(/arriving on (HBO Max|Netflix|Shudder|Hulu|Peacock|Disney\+|Prime Video|Paramount\+)/i)?.[1];
   result.push({title:film,release:{date,kind:platform?'Subscription':/PVOD/i.test(description)?'PVOD':'Digital',platform,confidence:/according to our sources|expected|not confirmed|neither announced/i.test(description)?'rumored':'listed',source,sourceName:'When To Stream',checkedAt:new Date().toISOString()}});
 }
 return result;
}
export const normalized = (s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
export function parseReportDetail(html:string,release:Release):Release|null {
 const body=html.match(/itemprop=['"]articleBody['"][^>]*>([\s\S]*?)<\/p>/i)?.[1];
 const meta=html.match(/property=['"]og:description['"][^>]*content=(["'])([\s\S]*?)\1/i)?.[2];
 const description=text(body||meta||'');const date=dateFromText(description);
 if(!description)throw new Error('Release report format changed');
 if(!date||/no longer|withdrawn|postponed|no date|cancelled|canceled/i.test(description))return null;
 return {...release,date,confidence:/according to our sources|expected|not confirmed|neither announced/i.test(description)?'rumored':'listed',checkedAt:new Date().toISOString()};
}
export async function fetchSource(url: string, init?: RequestInit): Promise<string> {
 const u = new URL(url);
 if (!['www.dvdsreleasedates.com','whentostream.com'].includes(u.hostname) || u.protocol!=='https:') throw new Error('Unsupported movie source');
 const cacheOptions=(!init?.method||init.method==='GET')?{next:{revalidate:21600}}:{};
 const signal=init?.signal?AbortSignal.any([init.signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000);
 const response = await fetch(url,{...cacheOptions,...init,signal,headers:{'User-Agent':'A-List/1.0 (personal US movie release tracker)',...init?.headers}});
 if (!response.ok) throw new Error(`Release source returned ${response.status}`);
 const body = await response.text();
 if (body.length<500 || body.length>2_000_000) throw new Error('Unexpected release source response');
 return body;
}
