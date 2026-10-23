import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMetadata,parseMetadataSearch,mergeSearchProviders,getMetadata} from '../lib/metadata';
import {parseSynopsis,parseDetail} from '../lib/sources';
import {refreshMovie} from '../lib/movie-refresh';
import {validMovieId,type Movie} from '../lib/model';
import {makeCalendar} from '../lib/calendar';
import {searchProviders} from '../lib/movie-search';
const raw={id:'tt39151344',type:'movie',name:'If I Go Will They Miss Me',releaseInfo:'2026',released:'2026-01-24T00:00:00Z',description:'A boy in Watts searches for connection with his distant father.',poster:'https://example.com/poster.jpg'};
const film=parseMetadata(raw)!;
const dvd:Movie={id:'12409',title:'The Devil Wears Prada 2',year:'2026',poster:'',source:'https://www.dvdsreleasedates.com/movies/12409/the-devil-wears-prada-2',checkedAt:'2026-10-23T12:00:00Z',releases:[{kind:'Digital',date:'2026-06-30',confidence:'listed',source:'https://www.dvdsreleasedates.com/movies/12409/the-devil-wears-prada-2',sourceName:'DVDs Release Dates'}]};
test('broader metadata includes a synopsis and IMDb identity without importing premiere dates',()=>{
 assert.equal(film.id,raw.id);assert.equal(film.year,'2026');assert.equal(film.overview,raw.description);
 assert.equal(film.theatrical,undefined);assert.deepEqual(film.releases,[]);
 assert.doesNotMatch(makeCalendar([film]),/BEGIN:VEVENT/);
 assert.equal(parseMetadata({...raw,type:'series'}),null);assert.equal(parseMetadata({...raw,id:'../../secret'}),null);
 assert.equal(parseMetadata({...raw,poster:'javascript:alert(1)'})!.poster,'');
 assert.equal(parseMetadataSearch({metas:[raw,{...raw,type:'series'}]}).length,1);
 assert.throws(()=>parseMetadataSearch({items:[]}));
});
test('IDs remain bounded and support both providers throughout the library and calendar',()=>{
 for(const id of ['12409','tt39151344','tt0111161'])assert.equal(validMovieId(id),true);
 for(const id of ['tt1','tt123456789012','../12409','12409 OR true','https://example.com','1/2'])assert.equal(validMovieId(id),false);
 const dated={...film,releases:dvd.releases};
 const calendar=makeCalendar([dated]);assert.match(calendar,/UID:movie-tt39151344-digital@afterlight/);assert.match(calendar,/20260630T130000Z/);
});
test('synopsis enrichment preserves release-provider IDs and dates and separates remakes',()=>{
 const meta={...film,id:'tt33071426',imdbId:'tt33071426',title:dvd.title};
 const merged=mergeSearchProviders([dvd],[meta]);
 assert.equal(merged.length,1);assert.equal(merged[0].id,dvd.id);assert.deepEqual(merged[0].releases,dvd.releases);assert.equal(merged[0].overview,film.overview);
 assert.equal(mergeSearchProviders([{...dvd,year:'2006'}],[meta]).length,2);
 assert.equal(mergeSearchProviders([{...dvd,year:''}],[meta]).length,2);
});
test('synopses support varied HTML attributes and Movie structured data without using generic page copy',()=>{
 assert.equal(parseSynopsis('<div class="plot" itemprop="description" lang="en">A father &amp; son reconnect.</div>'),'A father & son reconnect.');
 assert.equal(parseSynopsis('<script type="application/ld+json">{"@graph":[{"@type":"Movie","description":"A family story."}]}</script>'),'A family story.');
 assert.equal(parseSynopsis('<meta name="description" content="Find DVD release dates here">'),undefined);
 const parsed=parseDetail('<h2>Digital HD on June 30, 2026.</h2><p itemprop="description" class="plot">A new chapter.</p>',dvd);
 assert.equal(parsed.overview,'A new chapter.');assert.equal(parsed.overviewSource,dvd.source);
});
test('opening a synopsis leaves existing dates, source checks, and event IDs intact',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response('<h2>Digital HD on July 1, 2026.</h2><p class="plot" itemprop="description">Miranda returns to Runway.</p><!--'+'.'.repeat(500)+'-->');
 try{
  const result=await refreshMovie(dvd,{discoverReleases:false});
  assert.equal(result.overview,'Miranda returns to Runway.');assert.deepEqual(result.releases,dvd.releases);assert.equal(result.checkedAt,dvd.checkedAt);
  assert.equal(makeCalendar([result],{now:new Date(dvd.checkedAt)}),makeCalendar([dvd],{now:new Date(dvd.checkedAt)}));
 }finally{globalThis.fetch=original;}
});
test('a broader-catalogue film loads a full synopsis and rejects metadata for another film',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({meta:{...raw,description:'The complete sourced synopsis.'}});
 try{
  const result=await refreshMovie({...film,overview:'A truncated…'},{discoverReleases:false});
  assert.equal(result.overview,'The complete sourced synopsis.');assert.deepEqual(result.releases,[]);
  await assert.rejects(getMetadata('tt0111161'),/identity mismatch/);
 }finally{globalThis.fetch=original;}
});
test('either search provider can fail without disabling the other provider',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async url=>String(url).includes('cinemeta')?Response.json({metas:[raw]}):new Response('Unavailable',{status:503});
  const broad=await searchProviders(raw.name);assert.equal(broad.degraded,true);assert.equal(broad.movies[0].id,film.id);
  const listing='<td class="dvdcell"><a href="/movies/12409/the-devil-wears-prada-2"><img alt="The Devil Wears Prada 2 DVD Release Date" src="/posters/110/T/The-Devil-Wears-Prada-2-2026.jpg"></a></td><!--'+'.'.repeat(500)+'-->';
  globalThis.fetch=async url=>String(url).includes('cinemeta')?new Response('Unavailable',{status:503}):new Response(listing);
  const existing=await searchProviders(dvd.title);assert.equal(existing.movies[0].id,dvd.id);assert.equal(existing.degraded,true);
  globalThis.fetch=async()=>new Response('Unavailable',{status:503});
  await assert.rejects(searchProviders(raw.name),/unavailable/);
 }finally{globalThis.fetch=original;}
});
