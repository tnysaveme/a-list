import 'server-only';
import {randomUUID} from 'node:crypto';
import {adminDb} from './supabase/admin';
import {checked} from './data';
import {withLease,remember,metric,cache} from './infrastructure';
import {mergeMovies,type Movie} from './model';
import {fetchSource,parseListing,parseReports,normalized} from './sources';
import {refreshMovie} from './movie-refresh';
import {drainDue} from './work-batches';
const SIX_HOURS=6*3600_000;
async function loadCatalogue(){
 const now=new Date(),next=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1));
 const month=next.toLocaleString('en-US',{month:'long',timeZone:'UTC'}).toLowerCase();
 const urls=['https://www.dvdsreleasedates.com/digital-releases/',`https://www.dvdsreleasedates.com/digital-releases/${next.getUTCFullYear()}/${next.getUTCMonth()+1}/digital-hd-releases-${month}-${next.getUTCFullYear()}`,`https://www.dvdsreleasedates.com/new-movies-${now.getUTCFullYear()}/`,'https://whentostream.com/feed/'];
 const pages=await Promise.all(urls.map(url=>fetchSource(url)));
 const movies=mergeMovies(pages.slice(0,3).flatMap((html,i)=>parseListing(html,i<2))),reports=parseReports(pages[3]);
 if(movies.length<10)throw new Error('Source format or coverage changed');
 for(const movie of movies)for(const report of reports.filter(r=>normalized(r.title)===normalized(movie.title))){
  const existing=movie.releases.find(r=>r.kind===report.release.kind);
  if(!existing||existing.confidence==='rumored')movie.releases=[...movie.releases.filter(r=>r.kind!==report.release.kind),report.release];
 }
 return movies;
}
export async function refreshSources(){
 return withLease('ingestion',55,async()=>{
  const started=Date.now(),db=adminDb(),now=new Date().toISOString();
  const status=checked(await db.from('a_list_source_status').select('*').eq('id',true).single());
  checked(await db.from('a_list_source_status').update({last_attempt_at:now}).eq('id',true));
  let catalogueUpdated=false,refreshed=0,failed=0;
  if(!status.catalogue_success_at||Date.now()-Date.parse(status.catalogue_success_at)>=SIX_HOURS){
   try{
    const listing=await loadCatalogue();
    const existing=checked(await db.from('a_list_movies').select('id,movie').in('id',listing.map(m=>m.id)))||[];
    const old=new Map(existing.map(r=>[r.id,r.movie as Movie]));
    const movies=listing.map(m=>old.has(m.id)?mergeMovies([old.get(m.id)!,m])[0]:m);
    // Preserve per-film refresh scheduling and failure state on existing rows.
    checked(await db.rpc('a_list_publish_catalogue',{p_movies:movies,p_checked_at:now}));
    await remember('catalogue',{movies,checkedAt:now},300);catalogueUpdated=true;
    checked(await db.from('a_list_source_cache').delete().lt('updated_at',new Date(Date.now()-7*86400_000).toISOString()));
   }catch{failed++;console.error(JSON.stringify({event:'catalogue_refresh_failed'}));}
  }
  type Candidate={id:string;movie:Movie;refresh_failures:number};
  await drainDue<Candidate>(async()=>checked(await db.rpc('a_list_refresh_candidates',{p_limit:8})) as Candidate[],async row=>{
    try{
     const movie=await refreshMovie(row.movie);
     checked(await db.from('a_list_movies').update({movie,updated_at:new Date().toISOString(),refresh_after:new Date(Date.now()+SIX_HOURS).toISOString(),requested_at:null,refresh_failures:0}).eq('id',row.id));refreshed++;
    }catch{
     failed++;checked(await db.from('a_list_movies').update({refresh_failures:row.refresh_failures+1,refresh_after:new Date(Date.now()+Math.min(SIX_HOURS,1800_000*2**Math.min(row.refresh_failures,4))).toISOString()}).eq('id',row.id));
     console.warn(JSON.stringify({event:'film_refresh_failed'}));
    }
   },{started});
  const finished=new Date().toISOString();
  checked(await db.from('a_list_source_status').update({
   ...(catalogueUpdated||refreshed?{version:randomUUID(),updated_at:finished}:{}),
   ...(failed?{failures:status.failures+failed,last_failure_at:finished}:{failures:0,last_success_at:finished}),
  }).eq('id',true));
  if(refreshed)try{await cache().del('alist:catalogue');}catch{console.warn(JSON.stringify({event:'catalogue_cache_invalidation_failed'}));}
  await metric('refresh_failures',failed);await metric('refreshed_movies',refreshed);
  const result={catalogueUpdated,refreshed,failed,durationMs:Date.now()-started};console.log(JSON.stringify({event:'ingestion_finished',...result}));return result;
 });
}
