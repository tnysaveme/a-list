import type {SupabaseClient} from '@supabase/supabase-js';
import {getDb} from '../db';
import type {AccountRow,LibraryRow} from '../db/schema';
import snapshot from './catalogue.json';
import type {Movie} from './model';
import {fetchSource,parseListing} from './sources';
import {adminDb} from './supabase/admin';
import {cached,remember,privateKey,withLease,metric} from './infrastructure';
import type {LibraryPage} from './pagination';
import {makeCalendar} from './calendar';
import {feedDocument,type FeedDocument} from './feed-cache';
import {after} from 'next/server';
export type DataContext={db:SupabaseClient;userId:string};
export async function context(userId:string):Promise<DataContext>{return {db:await getDb(),userId};}
export function checked<T>({data,error}:{data:T;error:{message:string}|null}):T{if(error)throw new Error(error.message);return data;}
export async function membership(ctx:DataContext,movies:Movie[]):Promise<Movie[]>{
 if(!movies.length)return [];
 const rows=checked(await ctx.db.from('a_list_library').select('movie_id,tracked,added_at').eq('user_id',ctx.userId).in('movie_id',movies.map(m=>m.id))) as Pick<LibraryRow,'movie_id'|'tracked'|'added_at'>[];
 const saved=new Map(rows.map(r=>[r.movie_id,r]));
 return movies.map(m=>({...m,saved:saved.has(m.id),tracked:saved.get(m.id)?.tracked||false,addedAt:saved.get(m.id)?.added_at}));
}
type Catalogue={movies:Movie[];checkedAt:string|null};
export async function getCatalogue(ctx:DataContext){
 let result=await cached<Catalogue>('catalogue');
 if(!result){
  const row=checked(await ctx.db.from('a_list_source_status').select('catalogue,catalogue_success_at').eq('id',true).single())!;
  const listing=(row.catalogue.length?row.catalogue:snapshot) as Movie[];
  const fresh=checked(await ctx.db.from('a_list_movies').select('id,movie').in('id',listing.map(m=>m.id)))||[];
  const canonical=new Map(fresh.map(r=>[r.id,r.movie as Movie]));
  result={movies:listing.map(m=>canonical.get(m.id)||m),checkedAt:row.catalogue_success_at};
  await remember('catalogue',result,300);
 }
 return {movies:await membership(ctx,result.movies),stale:!result.checkedAt||Date.now()-Date.parse(result.checkedAt)>7*3600_000};
}
export async function searchMovies(ctx:DataContext,query:string):Promise<Movie[]>{
 const key=`search:${privateKey(query.trim().toLowerCase())}`;
 let found=await cached<Movie[]>(key);
 if(!found){
  const loaded=await withLease(key,20,async()=>{
   const again=await cached<Movie[]>(key);if(again)return again;
   const html=await fetchSource('https://www.dvdsreleasedates.com/search/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({searchStr:query}).toString()});
   const movies=parseListing(html,false).slice(0,24);
   if(movies.length)checked(await adminDb().from('a_list_movies').upsert(movies.map(movie=>({id:movie.id,movie,requested_at:new Date().toISOString()})),{onConflict:'id',ignoreDuplicates:true}));
   await remember(key,movies,3600);return movies;
  });
  if(!loaded)throw new Error('Search is already refreshing; try again shortly');found=loaded;
 }
 if(!found.length)return [];
 const fresh=checked(await ctx.db.from('a_list_movies').select('id,movie').in('id',found.map(m=>m.id)))||[];
 const canonical=new Map(fresh.map(r=>[r.id,r.movie as Movie]));
 return membership(ctx,found.map(m=>canonical.get(m.id)||m));
}
export async function getMovie(ctx:DataContext,id:string):Promise<Movie|null>{
 const row=checked(await ctx.db.from('a_list_movies').select('movie,refresh_after,requested_at').eq('id',id).maybeSingle());
 if(!row)return null;
 if(!row.requested_at&&(!row.movie.overview||Date.parse(row.refresh_after)<Date.now())){
  checked(await adminDb().from('a_list_movies').update({requested_at:new Date().toISOString(),refresh_after:new Date().toISOString()}).eq('id',id).is('requested_at',null));
 }
 return (await membership(ctx,[row.movie as Movie]))[0];
}
export async function account(ctx:DataContext):Promise<AccountRow>{
 checked(await ctx.db.from('a_list_accounts').upsert({id:ctx.userId},{onConflict:'id',ignoreDuplicates:true}));
 return checked(await ctx.db.from('a_list_accounts').select('*').eq('id',ctx.userId).single()) as AccountRow;
}
export async function getLibraryPage(ctx:DataContext,options:{sort?:string;filter?:string;offset?:number;limit?:number;tracked?:boolean}={}):Promise<LibraryPage>{
 const limit=options.limit||25,offset=options.offset||0;
 const page=checked(await ctx.db.rpc('a_list_library_page',{p_sort:options.sort||'release',p_filter:options.filter||'all',p_offset:offset,p_limit:limit,p_tracked:!!options.tracked})) as Omit<LibraryPage,'nextOffset'>;
 return {...page,nextOffset:offset+page.movies.length<page.filteredTotal?offset+page.movies.length:null};
}
export async function updateLibrary(ctx:DataContext,action:string,ids:string[],track=false){
 await account(ctx);const query=()=>ctx.db.from('a_list_library');
 if(action==='remove')checked(await query().delete().eq('user_id',ctx.userId).in('movie_id',ids));
 else if(action==='track'||action==='untrack')checked(await query().update({tracked:action==='track'}).eq('user_id',ctx.userId).in('movie_id',ids));
 else if(action==='add'){
  const rows=checked(await ctx.db.from('a_list_movies').select('id,movie').in('id',ids))||[];
  if(rows.length!==ids.length)throw new Error('Film not found');
  checked(await query().upsert(rows.map(r=>({user_id:ctx.userId,movie_id:r.id,movie:r.movie,tracked:track})),{onConflict:'user_id,movie_id',ignoreDuplicates:true}));
 }else throw new Error('Unknown library action');
}
export async function updateSettings(ctx:DataContext,includeRumors:boolean){
 await account(ctx);checked(await ctx.db.from('a_list_accounts').update({include_rumors:includeRumors}).eq('id',ctx.userId));
}
type FeedState={revision:string;sourcesVersion:string;modifiedAt:string;includeRumors:boolean};
export async function getCalendarFeed(token:string):Promise<FeedDocument|null>{
 const db=await getDb();
 // Authorize every request, including cache hits, and avoid caching across concurrent edits.
 for(let attempt=0;attempt<2;attempt++){
  const state=checked(await db.rpc('a_list_calendar_state',{p_token:token})) as FeedState|null;if(!state)return null;
  const key=`feed:${privateKey(token)}:${state.revision}:${state.sourcesVersion}`;
  const hit=await cached<FeedDocument>(key);if(hit){after(()=>metric('feed_cache_hit'));return hit;}
  const feed=checked(await db.rpc('a_list_calendar_feed',{p_token:token})) as {movies:Movie[];includeRumors:boolean}|null;if(!feed)return null;
  const currentState=checked(await db.rpc('a_list_calendar_state',{p_token:token})) as FeedState|null;if(!currentState)return null;
  if(currentState.revision!==state.revision||currentState.sourcesVersion!==state.sourcesVersion)continue;
  const document=feedDocument(makeCalendar(feed.movies,{includeRumors:feed.includeRumors,now:new Date(state.modifiedAt)}),state.modifiedAt);
  if(Buffer.byteLength(document.body)<2_000_000)await remember(key,document,3600);
  after(()=>metric('feed_cache_miss'));return document;
 }
 throw new Error('Calendar changed during refresh; retry');
}
