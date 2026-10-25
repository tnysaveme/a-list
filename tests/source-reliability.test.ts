import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshMovie,type SourceResult} from '../lib/movie-refresh';
import {parseDetail} from '../lib/sources';
import {sourceHealthSummary} from '../lib/source-health';
import type {Movie} from '../lib/model';
const stamp='2026-10-25T00:00:00Z',padding='<!--'+'.'.repeat(600)+'-->';
const film:Movie={id:'123',title:'A Film',year:'2026',imdbId:'tt1234567',identityVerifiedAt:stamp,poster:'',source:'https://www.dvdsreleasedates.com/movies/123/a-film',overview:'A synopsis.',checkedAt:stamp,releaseCheckedAt:stamp,releases:[{kind:'Digital',date:'2026-10-01',source:'https://www.dvdsreleasedates.com/movies/123/a-film',sourceName:'DVDs Release Dates',confidence:'listed'},{kind:'Subscription',platform:'Netflix',date:'2026-11-01',source:'https://whentostream.com/a-film-streaming/',sourceName:'When To Stream',confidence:'listed',filmImdbId:'tt1234567',filmIdentityMethod:'structured'}]};
const article='<script type="application/ld+json">'+JSON.stringify({'@type':'Movie',name:film.title,sameAs:'https://www.imdb.com/title/tt1234567/',datePublished:'2026-01-01'})+'</script><div itemprop="articleBody"><p>A Film is arriving on Netflix on November 3, 2026.</p></div>'+padding;
test('WTS revalidates independently while the primary fails, preserving primary dates and last full check',async()=>{
 const original=globalThis.fetch,checks:SourceResult[]=[];let wtsStarted=false;
 globalThis.fetch=async url=>{if(String(url).includes('whentostream.com')){wtsStarted=true;return new Response(article);}await Promise.resolve();assert.equal(wtsStarted,true);return new Response('Unavailable',{status:503});};
 try{const result=await refreshMovie(film,{onSourceResult:r=>checks.push(r)});assert.equal(result.releases[0].date,'2026-10-01');assert.equal(result.releases[1].date,'2026-11-03');assert.equal(result.releaseCheckedAt,stamp);assert.deepEqual(checks,[{source:'primary',success:false},{source:'wts',success:true}]);assert.equal(film.releases[1].date,'2026-11-01');}finally{globalThis.fetch=original;}
});
test('a successful WTS withdrawal still applies when the primary is unavailable',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async url=>String(url).includes('whentostream.com')?new Response(article.replace('is arriving on Netflix on November 3, 2026.','has no date; its release has been withdrawn.')):new Response('Unavailable',{status:503});
 try{const result=await refreshMovie(film);assert.deepEqual(result.releases,[film.releases[0]]);assert.equal(result.releaseCheckedAt,stamp);}finally{globalThis.fetch=original;}
});
test('unexpected headings and unrelated native subjects cannot withdraw a legacy primary date',()=>{
 const legacy={...film,imdbId:undefined,identityVerifiedAt:undefined,releases:[film.releases[0]]};
 for(const html of ['<h2>Please verify your browser</h2>','<h2>DVD release date not announced</h2>',`<link rel="canonical" href="${film.source}"><h1>Another Film (2026)</h1><h2>DVD release date not announced</h2>`])assert.throws(()=>parseDetail(html,legacy));
 const valid=`<link rel="canonical" href="${film.source}"><h1>A Film (2025)</h1><h2>DVD release date not yet announced</h2>`;
 assert.equal(parseDetail(valid,legacy).releases.length,0,'Recognised native subject permits a real withdrawal even when the stored year differs');assert.equal(legacy.releases.length,1);
});
test('source health detects individual failures and stale feed/catalogue data despite recent job success',()=>{
 const now=Date.parse('2026-10-25T12:00:00Z'),recent='2026-10-25T11:59:00Z',old='2026-10-24T00:00:00Z';
 const status={last_success_at:recent,catalogue_success_at:recent,failures:0,source_health:{wts_feed:{ok:true,lastSuccess:recent}}};
 assert.equal(sourceHealthSummary(status,now).status,'healthy');
 assert.ok(sourceHealthSummary({...status,source_health:{wts_feed:{ok:false,lastSuccess:recent}}},now).issues.includes('wts_feed_failed'));
 const stale=sourceHealthSummary({...status,catalogue_success_at:old,source_health:{wts_feed:{ok:true,lastSuccess:old}}},now);assert.ok(stale.issues.includes('catalogue_stale'));assert.ok(stale.issues.includes('wts_feed_stale'));
 assert.ok(sourceHealthSummary({...status,source_health:{...status.source_health,wts_reports:{ok:false,lastSuccess:recent}}},now).issues.includes('wts_reports_failed'));
});
