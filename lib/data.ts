import type {SupabaseClient} from '@supabase/supabase-js';
import {getDb} from '../db';
import type {AccountRow,LibraryRow,CacheRow} from '../db/schema';
import snapshot from './catalogue.json';
import {mergeMovies,type Movie} from './model';
import {fetchSource,parseDetail,parseListing,parseReports,parseReportDetail,normalized} from './sources';
const TTL=6*60*60*1000;
export type DataContext={db:SupabaseClient;userId:string};
export async function context(userId:string):Promise<DataContext>{return {db:await getDb(),userId};}
function checked<T>({data,error}:{data:T;error:{message:string}|null}):T{if(error)throw new Error(error.message);return data;}
async function cacheGet(ctx:DataContext,key:string){return checked(await ctx.db.from('a_list_source_cache').select('*').eq('user_id',ctx.userId).eq('key',key).maybeSingle()) as CacheRow|null;}
async function cacheSet(ctx:DataContext,key:string,value:unknown,updatedAt=new Date().toISOString()) {checked(await ctx.db.from('a_list_source_cache').upsert({user_id:ctx.userId,key,value,updated_at:updatedAt},{onConflict:'user_id,key'}));}
async function loadLiveCatalogue():Promise<{movies:Movie[];stale:boolean}> {
 const now=new Date();const next=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1));
 const month=next.toLocaleString('en-US',{month:'long',timeZone:'UTC'}).toLowerCase();
 const urls=['https://www.dvdsreleasedates.com/digital-releases/',`https://www.dvdsreleasedates.com/digital-releases/${next.getUTCFullYear()}/${next.getUTCMonth()+1}/digital-hd-releases-${month}-${next.getUTCFullYear()}`,`https://www.dvdsreleasedates.com/new-movies-${now.getUTCFullYear()}/`,'https://whentostream.com/feed/'];
 const results=await Promise.allSettled(urls.map(url=>fetchSource(url)));
 const movies=mergeMovies(results.slice(0,3).flatMap((result,i)=>result.status==='fulfilled'?parseListing(result.value,i<2):[]));
 const reports=results[3].status==='fulfilled'?parseReports(results[3].value):[];
 for(const movie of movies)for(const report of reports.filter(r=>normalized(r.title)===normalized(movie.title))) {
  const existing=movie.releases.find(r=>r.kind===report.release.kind);
  if(!existing||existing.confidence==='rumored')movie.releases=[...movie.releases.filter(r=>r.kind!==report.release.kind),report.release];
 }
 return {movies,stale:movies.length<10||results.some(r=>r.status==='rejected')};
}
export async function getCatalogue(ctx:DataContext,force=false):Promise<{movies:Movie[];stale:boolean}> {
 const cached=await cacheGet(ctx,'catalogue');
 if(cached&&!force&&Date.now()-Date.parse(cached.updated_at)<TTL)return {movies:cached.value as Movie[],stale:false};
 const result=await loadLiveCatalogue();
 if(result.stale)return {movies:cached?cached.value as Movie[]:snapshot as Movie[],stale:true};
 await cacheSet(ctx,'catalogue',result.movies);return result;
}
export async function searchMovies(ctx:DataContext,query:string):Promise<Movie[]> {
 const html=await fetchSource('https://www.dvdsreleasedates.com/search/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({searchStr:query}).toString()});
 const found=parseListing(html,false).slice(0,24);
 // Search metadata is never mistaken for a refreshed digital-release record.
 await Promise.all(found.map(m=>cacheSet(ctx,`search:${m.id}`,m)));
 return found;
}
async function refreshMovie(movie:Movie):Promise<Movie>{
 if(!/^\d{1,8}$/.test(movie.id)||new URL(movie.source).hostname!=='www.dvdsreleasedates.com'||!new URL(movie.source).pathname.startsWith(`/movies/${movie.id}/`))throw new Error('Invalid film source');
 const reports=movie.releases.filter(r=>r.sourceName==='When To Stream');
 const [detail,...refreshed]=await Promise.all([fetchSource(movie.source),...reports.map(async r=>parseReportDetail(await fetchSource(r.source),r))]);
 const result=parseDetail(detail as string,movie);
 result.releases=result.releases.filter(r=>r.sourceName!=='When To Stream');
 for(const report of refreshed)if(report&&typeof report!=='string'&&!result.releases.some(r=>r.kind===report.kind))result.releases.push(report);
 return result;
}
export async function getMovie(ctx:DataContext,id:string,refresh=false):Promise<Movie|null>{
 const cached=await cacheGet(ctx,`movie:${id}`);
 if(cached&&!refresh&&Date.now()-Date.parse(cached.updated_at)<TTL)return cached.value as Movie;
 const current=(await getCatalogue(ctx)).movies.find(m=>m.id===id);
 const searched=!cached&&!current?await cacheGet(ctx,`search:${id}`):null;
 const movie=cached?mergeMovies([cached.value as Movie,...(current?[current]:[])])[0]:current||searched?.value as Movie|undefined;
 if(!movie)return null;
 const result=await refreshMovie(movie);await cacheSet(ctx,`movie:${id}`,result,result.checkedAt);return result;
}
export async function account(ctx:DataContext):Promise<AccountRow>{
 checked(await ctx.db.from('a_list_accounts').upsert({id:ctx.userId},{onConflict:'id',ignoreDuplicates:true}));
 return checked(await ctx.db.from('a_list_accounts').select('*').eq('id',ctx.userId).single()) as AccountRow;
}
export async function getLibrary(ctx:DataContext):Promise<Movie[]>{
 const rows=checked(await ctx.db.from('a_list_library').select('*').eq('user_id',ctx.userId)) as LibraryRow[];
 return rows.map(row=>({...row.movie,tracked:row.tracked,addedAt:row.added_at}));
}
export async function refreshLibrary(ctx:DataContext){
 const movies=await getLibrary(ctx);let failed=0;
 for(let i=0;i<movies.length;i+=4)await Promise.all(movies.slice(i,i+4).map(async movie=>{
  try{const fresh=await getMovie(ctx,movie.id);if(fresh)checked(await ctx.db.from('a_list_library').update({movie:fresh}).eq('user_id',ctx.userId).eq('movie_id',movie.id));}catch{failed++;}
 }));return {movies:await getLibrary(ctx),failed};
}
export async function updateLibrary(ctx:DataContext,action:string,ids:string[],track=false){
 const query=()=>ctx.db.from('a_list_library');
 if(action==='remove')checked(await query().delete().eq('user_id',ctx.userId).in('movie_id',ids));
 else if(action==='track'||action==='untrack')checked(await query().update({tracked:action==='track'}).eq('user_id',ctx.userId).in('movie_id',ids));
 else if(action==='add'){
  // Resolve the entire batch before writing, so a missing source cannot leave half a batch saved.
  const movies=await Promise.all(ids.map(id=>getMovie(ctx,id)));
  if(movies.some(m=>!m))throw new Error('Film not found');
  checked(await query().upsert(movies.map(movie=>({user_id:ctx.userId,movie_id:movie!.id,movie,tracked:track})),{onConflict:'user_id,movie_id',ignoreDuplicates:true}));
 }else throw new Error('Unknown library action');
 return getLibrary(ctx);
}
export async function updateSettings(ctx:DataContext,includeRumors:boolean){
 await account(ctx);checked(await ctx.db.from('a_list_accounts').update({include_rumors:includeRumors}).eq('id',ctx.userId));
}
export async function getCalendarFeed(token:string){
 const db=await getDb();const result=checked(await db.rpc('a_list_calendar_feed',{p_token:token})) as {movies:Movie[];includeRumors:boolean}|null;
 if(!result)return null;
 // The anonymous feed can only read the explicitly tracked subset. It has no write privilege.
 const live=await loadLiveCatalogue();const current=new Map(live.movies.map(m=>[m.id,m]));
 const movies=await Promise.all(result.movies.map(async movie=>{
  try{return await refreshMovie(current.has(movie.id)?mergeMovies([movie,current.get(movie.id)!])[0]:movie);}catch{return movie;}
 }));
 return {...result,movies};
}
