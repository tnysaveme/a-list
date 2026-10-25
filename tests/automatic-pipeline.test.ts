import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {profileFingerprint,type SourceProfile} from '../lib/release-profile';
import {mergeReleaseFeed,SIX_HOURS,type MatchRow,type FeedEntry} from '../lib/release-automation';
import type {Movie} from '../lib/model';
import type {adminDb} from '../lib/supabase/admin';
registerHooks({resolve(specifier,context,next){return specifier==='server-only'?{url:new URL('../node_modules/next/dist/compiled/server-only/empty.js',import.meta.url).href,shortCircuit:true}:next(specifier,context);}});
const {expandReleases}=await import('../lib/release-expansion');
const padding='<!--'+'.'.repeat(600)+'-->';
const now=new Date().toISOString(),profileTime=new Date(Date.now()-3600_000).toISOString();
function film(index:number){
 const profile:SourceProfile={sourceFilmId:String(8000+index),sourceFilmUrl:`https://whentostream.com/film-${index}-2026/`,title:`Film ${index}`,year:'2026',directors:['A Director'],cast:['First Actor','Second Actor'],overview:'A family searches for an island.'};
 const movie:Movie={id:`tt${7000000+index}`,imdbId:`tt${7000000+index}`,title:profile.title,year:'2026',source:`https://www.imdb.com/title/tt${7000000+index}/`,poster:'',checkedAt:now,releases:[]};
 const row:MatchRow={source_id:profile.sourceFilmId,profile,fingerprint:profileFingerprint(profile),reviewed_fingerprint:profileFingerprint(profile),status:'approved',approved_imdb_id:movie.id,movie_id:movie.id,reviewed_at:now,checked_at:now,profile_checked_at:profileTime,match_method:'reviewed',rule_version:0,reports:[],suggestions:[],rationale:'Previously reviewed identity'};
 const report={title:profile.title,release:{source:`https://whentostream.com/film-${index}-streaming/`,sourceName:'When To Stream',kind:'Subscription' as const,platform:'Netflix',date:'2026-11-11',confidence:'listed' as const}};
 const entry=mergeReleaseFeed([],[report],now)[0];
 const article=`<div itemprop="articleBody"><p><a href="${profile.sourceFilmUrl}" data-type="page" data-id="${profile.sourceFilmId}">${profile.title}</a> is arriving on Netflix on November 11, 2026.</p></div>${padding}`;
 const page=`<link rel="canonical" href="${profile.sourceFilmUrl}"><article id="post-${profile.sourceFilmId}"><h1>${profile.title} (2026)</h1><p>Director: A Director</p><p>Cast: First Actor, Second Actor</p><p>Synopsis: ${profile.overview}</p></article>${padding}`;
 return {profile,movie,row,entry,article,page};
}
function store(seed:ReturnType<typeof film>[]){
 const rows=new Map(seed.map(f=>[f.row.source_id,f.row])),movies=new Map(seed.map(f=>[f.movie.id,{id:f.movie.id,movie:f.movie,updated_at:now}]));
 const writes:{name:string;args:Record<string,unknown>}[]=[],state={feed:[] as FeedEntry[]};
 const db={from(table:string){
  const filters=new Map<string,unknown>();let expression='',single=false,update:Record<string,unknown>|undefined;
  const query={select(){return query;},eq(key:string,value:unknown){filters.set(key,value);return query;},or(value:string){expression=value;return query;},limit(){return query;},abortSignal(){return query;},maybeSingle(){single=true;return query;},update(value:Record<string,unknown>){update=value;return query;},then(resolve:(value:{data:unknown;error:null})=>unknown){
   let data:unknown=[];
   if(table==='a_list_release_candidates')data=rows.get(String(filters.get('source_id')))||null;
   if(table==='a_list_movies'){
    const id=String(filters.get('id')||expression.match(/id\.eq\.(tt\d+)/)?.[1]||'');const found=[...movies.values()].filter(row=>row.id===id||row.movie.imdbId===id);data=single?found[0]||null:found;
   }
   if(update?.wts_feed)state.feed=update.wts_feed as FeedEntry[];
   return Promise.resolve({data,error:null}).then(resolve);
  }};return query;
 },rpc(name:string,args:Record<string,unknown>){
  writes.push({name,args});
  return {abortSignal(){if(args.p_movie){const movie=args.p_movie as Movie;movies.set(movie.id,{id:movie.id,movie,updated_at:now});}return Promise.resolve({data:{matched:true},error:null});}};
 }};
 return {db:db as unknown as ReturnType<typeof adminDb>,rows,movies,writes,state};
}
test('warm automatic processing is bounded to five films/two concurrent checks, performs no metadata searches, and repeat runs do no work',async()=>{
 const fixtures=Array.from({length:8},(_,index)=>film(index)),fake=store(fixtures),original=globalThis.fetch;
 let active=0,peak=0,requests=0;
 globalThis.fetch=async url=>{
  requests++;active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,5));active--;
  const found=fixtures.find(f=>f.entry.report.release.source===String(url));assert.ok(found,'Known mappings must avoid metadata and profile lookups while fresh');return new Response(found.article);
 };
 try{
  const first=await expandReleases(fixtures.map(f=>f.entry),{db:fake.db,publishUnknown:true});
  assert.equal(first.matched,5);assert.equal(requests,5);assert.ok(peak<=2);assert.equal(fake.writes.length,5);
  for(const write of fake.writes)assert.equal((write.args.p_match as {profile_checked_at:string}).profile_checked_at,profileTime);
  const repeated=await expandReleases(fake.state.feed.slice(0,5),{db:fake.db,publishUnknown:true});assert.equal(repeated.processed,0);assert.equal(requests,5);
  const shadow=await expandReleases([fixtures[0].entry],{db:fake.db,dryRun:true});assert.equal(shadow.matched,1);assert.equal(fake.writes.length,5);
 }finally{globalThis.fetch=original;}
});
test('cold matching imports one corroborated identity, defers ambiguity and failed metadata, and honours the pause switch',async()=>{
 const fixture=film(0),original=globalThis.fetch;
 async function run(mode:'unique'|'ambiguous'|'failed'|'paused'){
  const fake=store([]);let metadataCalls=0;
  globalThis.fetch=async url=>{
   const path=String(url);
   if(path===fixture.entry.report.release.source)return new Response(fixture.article);
   if(path===fixture.profile.sourceFilmUrl)return new Response(fixture.page);
   if(path.includes('/catalog/')){metadataCalls++;return Response.json({metas:[0,1].map(index=>({id:`tt${7000000+index}`,type:'movie',name:'Film 0',year:'2026'}))});}
   if(path.includes('/meta/')){metadataCalls++;if(mode==='failed'&&path.includes('7000001'))return new Response('Unavailable',{status:503});return Response.json({meta:{id:path.includes('7000001')?'tt7000001':'tt7000000',type:'movie',name:'Film 0',year:'2026',director:path.includes('7000001')&&mode==='unique'?['Another Director']:['A Director'],cast:['First Actor','Second Actor'],description:'A family searches for an island.'}});}
   if(path==='https://www.dvdsreleasedates.com/search/')return new Response('<div>No results found</div>'+padding);
   throw Error('Unexpected upstream request');
  };
  const result=await expandReleases([fixture.entry],{db:fake.db,publishUnknown:mode!=='paused'});return {result,fake,metadataCalls};
 }
 try{
  const unique=await run('unique');assert.equal(unique.result.matched,1);assert.equal(unique.result.decisions[0].method,'corroborated');assert.equal(unique.fake.writes.length,1);assert.equal(unique.metadataCalls,3);
  for(const mode of ['ambiguous','failed','paused'] as const){const result=await run(mode);assert.equal(result.result.matched,0);assert.equal(result.fake.writes.length,0);assert.ok(Date.parse(result.fake.state.feed[0].nextCheckAt!)>Date.now());if(mode==='paused')assert.equal(result.metadataCalls,0);}
 }finally{globalThis.fetch=original;}
});
test('a temporary profile failure retains known dates; positively changed evidence invalidates its mapping',async()=>{
 const fixture=film(0),original=globalThis.fetch;
 try{
  for(const changed of [false,true]){
   const fake=store([{...fixture,row:{...fixture.row,profile_checked_at:new Date(Date.now()-2*SIX_HOURS).toISOString()}}]);
   globalThis.fetch=async url=>String(url)===fixture.entry.report.release.source?new Response(fixture.article):String(url)===fixture.profile.sourceFilmUrl?changed?new Response(fixture.page.replace('Director: A Director','Director: Someone Else')):new Response('Unavailable',{status:503}):Response.json({metas:[]});
   const result=await expandReleases([fixture.entry],{db:fake.db,publishUnknown:true});assert.equal(result.matched,0);
   assert.equal(fake.writes.length,changed?1:0);if(changed)assert.equal((fake.writes[0].args.p_match as {status:string}).status,'pending');
  }
 }finally{globalThis.fetch=original;}
});
test('expired work carries over rather than receiving a 24-hour unresolved backoff',async()=>{
 const fixtures=[film(0),film(1)],fake=store(fixtures),original=globalThis.fetch;
 globalThis.fetch=async(_url,init)=>new Promise((_,reject)=>{const hold=setTimeout(()=>reject(Error('delayed')),100);init?.signal?.addEventListener('abort',()=>{clearTimeout(hold);reject(Error('aborted'));},{once:true});});
 try{
  const result=await expandReleases(fixtures.map(f=>f.entry),{db:fake.db,budgetMs:10,publishUnknown:true});assert.equal(result.matched,0);assert.equal(fake.writes.length,0);assert.ok(fake.state.feed.every(entry=>!entry.nextCheckAt));
 }finally{globalThis.fetch=original;}
});
test('explicit Movie IDs work without a native crosswalk and known structured reports continue while new imports are paused',async()=>{
 const fixture=film(0),original=globalThis.fetch;
 const schema={"@type":"Movie",name:fixture.movie.title,sameAs:fixture.movie.source,datePublished:'2026-01-01'};
 const html=fixture.article.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/,'$1')+`<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
 globalThis.fetch=async url=>{assert.equal(String(url),fixture.entry.report.release.source);return new Response(html);};
 try{
  const fake=store([fixture]);
  const result=await expandReleases([{...fixture.entry,movieId:fixture.movie.id}],{db:fake.db,publishUnknown:false});
  assert.equal(result.matched,1);assert.equal(result.decisions[0].method,'structured');assert.equal(fake.writes[0].args.p_match,null);
 }finally{globalThis.fetch=original;}
});

test('targeted older reports preserve the shared feed checkpoint and reject a different IMDb subject',async()=>{
 const fixture=film(0),fake=store([fixture]),original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(fixture.article);
 try{
  const different=await expandReleases([fixture.entry],{db:fake.db,publishUnknown:true,checkpoint:false,expectedImdbId:'tt1111111'});
  assert.equal(different.matched,0);assert.equal(different.decisions[0].outcome,'different_film_identity');assert.equal(fake.writes.length,0);assert.deepEqual(fake.state.feed,[]);
  const matched=await expandReleases([fixture.entry],{db:fake.db,publishUnknown:true,checkpoint:false,expectedImdbId:fixture.movie.imdbId});
  assert.equal(matched.matched,1);assert.equal(fake.writes.length,1);assert.deepEqual(fake.state.feed,[]);
 }finally{globalThis.fetch=original;}
});

test('temporary report availability failures retry after fifteen minutes, separately from identity evidence',async()=>{
 const fixture=film(0),fake=store([fixture]),original=globalThis.fetch;
 globalThis.fetch=async()=>new Response('Unavailable',{status:503});
 try{await expandReleases([fixture.entry],{db:fake.db,publishUnknown:true});const delay=Date.parse(fake.state.feed[0].nextCheckAt!)-Date.now();assert.ok(delay>14*60_000&&delay<=15*60_000);assert.equal(fake.writes.length,0);}finally{globalThis.fetch=original;}
});
test('feed health detects malformed successful HTTP responses and retains the previous reports',async()=>{
 const {expansionFeed}=await import('../lib/release-expansion');const {createClient}=await import('@supabase/supabase-js');
 const fixture=film(0),original=globalThis.fetch,writes:Record<string,unknown>[]=[],checks:Record<string,unknown>[]=[];
 const db=createClient('https://feed.test','test',{auth:{persistSession:false},global:{fetch:async(input,init)=>{const body=JSON.parse(String(init?.body));if(String(input).includes('/rpc/'))checks.push(body);else writes.push(body);return Response.json(null);}}});
 try{
  globalThis.fetch=async()=>new Response('<html><h2>Verify your browser</h2>'+padding+'</html>');
  const retained=await expansionFeed({wts_feed:[fixture.entry]},AbortSignal.timeout(5000),db);assert.deepEqual(retained,[fixture.entry]);assert.equal(checks[0].p_success,false);assert.ok(Date.parse(String(writes[0].wts_feed_after))-Date.now()<=15*60_000);
  globalThis.fetch=async()=>new Response('<rss><channel>'+padding+'</channel></rss>');await expansionFeed({wts_feed:[fixture.entry]},AbortSignal.timeout(5000),db);assert.equal(checks[1].p_success,true);
 }finally{globalThis.fetch=original;}
});
