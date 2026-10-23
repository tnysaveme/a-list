import type {Movie} from './model';
import {normalized,text} from './sources';
const BASE='https://v3-cinemeta.strem.io';
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export const imdbId=(value:unknown):value is string=>typeof value==='string'&&/^tt[0-9]{7,10}$/.test(value);
export function parseMetadata(value:unknown,checkedAt=new Date().toISOString()):Movie|null{
 if(!object(value)||value.type!=='movie'||!imdbId(value.id)||typeof value.name!=='string'||!value.name.trim())return null;
 const id=value.id,title=text(value.name).slice(0,300),year=String(value.releaseInfo||value.year||'').match(/^(?:18|19|20)\d{2}/)?.[0]||'';
 let poster='';
 if(typeof value.poster==='string')try{const url=new URL(value.poster);if(url.protocol==='https:')poster=url.href;}catch{}
 const overview=typeof value.description==='string'?text(value.description).slice(0,4000):undefined;
 return {id,imdbId:id,title,year,poster,overview,overviewSource:overview?`${BASE}/meta/movie/${id}.json`:undefined,source:`https://www.imdb.com/title/${id}/`,metadataCheckedAt:checkedAt,checkedAt,releases:[]};
 // A metadata premiere/released date is deliberately never a US home release date.
}
export function parseMetadataSearch(value:unknown):Movie[]{
 if(!object(value)||!Array.isArray(value.metas))throw new Error('Movie catalogue format changed');
 return value.metas.slice(0,30).map(m=>parseMetadata(m)).filter((m):m is Movie=>!!m);
}
export function mergeSearchProviders(listings:Movie[],metadata:Movie[]):Movie[]{
 const used=new Set<string>();
 const movies=listings.map(movie=>{
  // A year is required for title-based merging so remakes and shorts stay separate.
  const match=metadata.find(m=>!used.has(m.id)&&(movie.imdbId===m.imdbId||!!movie.year&&movie.year===m.year&&normalized(movie.title)===normalized(m.title)));
  if(!match)return movie;used.add(match.id);
  return {...match,...movie,imdbId:match.imdbId,overview:movie.overview||match.overview,overviewSource:movie.overview?movie.overviewSource:match.overviewSource,metadataCheckedAt:match.metadataCheckedAt};
 });
 return [...movies,...metadata.filter(m=>!used.has(m.id))];
}
async function fetchMetadata(path:string,signal?:AbortSignal):Promise<unknown>{
 const response=await fetch(BASE+path,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(8000)]):AbortSignal.timeout(8000),next:{revalidate:21600},headers:{'User-Agent':'A-List/1.0 (movie metadata)'}});
 if(!response.ok)throw new Error(`Movie catalogue returned ${response.status}`);
 const body=await response.text();if(body.length>2_000_000)throw new Error('Movie catalogue response too large');
 return JSON.parse(body);
}
export async function searchMetadata(query:string):Promise<Movie[]>{return parseMetadataSearch(await fetchMetadata(`/catalog/movie/top/search=${encodeURIComponent(query)}.json`));}
export async function getMetadata(id:string,signal?:AbortSignal):Promise<Movie>{
 if(!imdbId(id))throw new Error('Invalid movie metadata ID');
 const data=await fetchMetadata(`/meta/movie/${id}.json`,signal);
 const movie=object(data)?parseMetadata(data.meta):null;
 if(!movie||movie.id!==id)throw new Error('Movie metadata identity mismatch');
 return movie;
}
