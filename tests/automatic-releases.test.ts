import test from 'node:test';
import assert from 'node:assert/strict';
import {activeReleaseIdentities,automaticEvidence,cachedIdentity,expansionMovie,mergeReleaseFeed,dueReleaseEntries,feedRevision,SIX_HOURS,type MatchRow} from '../lib/release-automation';
import {parseSourceProfile,profileFingerprint,type SourceProfile} from '../lib/release-profile';
import {mergeImportedCatalogue} from '../lib/imported-catalogue';
import {parseVerifiedReport,type ReleaseReport} from '../lib/sources';
import {makeCalendar} from '../lib/calendar';
import {refreshMovie} from '../lib/movie-refresh';
import type {MetadataEvidence} from '../lib/metadata';

const profile:SourceProfile={sourceFilmId:'7001',sourceFilmUrl:'https://whentostream.com/a-film-2026/',title:'A Film',year:'2026',directors:['A Director'],cast:['First Actor','Second Actor'],overview:'A family searches for an island.'};
const evidence:MetadataEvidence={movie:{id:'tt7777777',imdbId:'tt7777777',title:'A Film',year:'2026',source:'https://www.imdb.com/title/tt7777777/',poster:'',checkedAt:'2026-10-25T00:00:00Z',releases:[]},directors:['A Director'],cast:['First Actor','Second Actor']};
const report:ReleaseReport={title:'A Film',publishedAt:'Sun, 25 Oct 2026 00:00:00 GMT',release:{source:'https://whentostream.com/a-film-streaming/',sourceName:'When To Stream',kind:'Subscription',platform:'Netflix',date:'2026-11-11',confidence:'listed'}};
const identity={sourceFilmId:profile.sourceFilmId,sourceFilmUrl:profile.sourceFilmUrl,title:profile.title,year:profile.year,imdbId:evidence.movie.id,reviewedAt:evidence.movie.checkedAt,method:'corroborated' as const,evidence:{metadata:evidence.movie.source,releaseSource:evidence.movie.source,corroboration:'Distinct director and cast evidence'}};
const article=`<div itemprop="articleBody"><p><a href="${profile.sourceFilmUrl}" data-type="page" data-id="7001">A Film</a> is arriving on Netflix on November 11, 2026.</p></div>`;

test('native profiles bind their canonical URL, page ID, title/year and credits before matching',()=>{
 const html=`<link rel="canonical" href="${profile.sourceFilmUrl}"><article id="post-7001"><h1>A Film (2026)</h1><p>Director: A Director</p><p>Cast: First Actor, Second Actor</p><p>Synopsis: ${profile.overview}</p></article>`;
 assert.deepEqual(parseSourceProfile(html,profile),profile);
 for(const broken of [html.replace('post-7001','post-9999'),html.replace('(2026)','(2006)'),html.replace('rel="canonical"','rel="alternate"'),html.replace('Director:','Writer:')])assert.throws(()=>parseSourceProfile(broken,profile));
 assert.equal(profileFingerprint(profile),profileFingerprint({...profile,cast:[...profile.cast].reverse()}));
 assert.notEqual(profileFingerprint(profile),profileFingerprint({...profile,overview:'Another story.'}));
});

test('automatic credit inference requires a unique exact title/year, director and two distinct cast members',()=>{
 assert.equal(automaticEvidence(profile,[evidence]).movie.id,evidence.movie.id);
 for(const bad of [{...evidence,directors:['Another Director']},{...evidence,cast:['First Actor']},{...evidence,cast:['First Actor','First Actor']},{...evidence,movie:{...evidence.movie,year:'2006'}},{...evidence,movie:{...evidence.movie,title:'A Film 2'}}])assert.throws(()=>automaticEvidence(profile,[bad]),/insufficient/);
 assert.throws(()=>automaticEvidence(profile,[evidence,{...evidence,movie:{...evidence.movie,id:'tt8888888',imdbId:'tt8888888'}}]),/ambiguous/);
 // A sparse documentary remains unresolved until an explicit or previously reviewed identity exists.
 assert.throws(()=>automaticEvidence({...profile,cast:['First Actor']},[{...evidence,cast:['First Actor']}]),/insufficient/);
 assert.equal(automaticEvidence(profile,[{...evidence,cast:[],directors:[]}],evidence.movie.id).movie.id,evidence.movie.id);
 assert.throws(()=>automaticEvidence(profile,[evidence],'tt1111111'),/insufficient/);
});
test('persisted reviewed identities retain their method and inference never masquerades as human review',()=>{
 const row={source_id:'7001',profile,fingerprint:profileFingerprint(profile),reviewed_fingerprint:profileFingerprint(profile),status:'approved',approved_imdb_id:evidence.movie.id,reviewed_at:evidence.movie.checkedAt,checked_at:evidence.movie.checkedAt,match_method:'reviewed',rationale:'Historical reviewed identity'} as MatchRow;
 assert.equal(cachedIdentity(row)?.method,'reviewed');
 assert.equal(cachedIdentity({...row,match_method:'corroborated',rule_version:1})?.method,'corroborated');
 assert.equal(cachedIdentity({...row,match_method:'corroborated',rule_version:0}),undefined);
 assert.equal(cachedIdentity({...row,fingerprint:'changed'}),undefined);assert.equal(cachedIdentity({...row,status:'pending'}),undefined);
 assert.equal(activeReleaseIdentities([], [identity]).length,1);
 assert.equal(activeReleaseIdentities([{...row,status:'pending'}], [identity]).length,0);
 assert.equal(activeReleaseIdentities([row], [identity])[0].method,'reviewed');
 const verified=parseVerifiedReport(article,report,[identity])!;
 assert.equal(verified.release.filmIdentityMethod,'corroborated');
 assert.equal(parseVerifiedReport(article,report,[]),null);
 assert.equal(parseVerifiedReport(article,report,[{...identity,method:'structured'}]),null);
});
test('incremental feed state ignores check timestamps, retains deferred work and retries changed evidence immediately',()=>{
 const now='2026-10-25T00:00:00Z',first=mergeReleaseFeed([], [report],now);
 first[0].checkedAt=now;first[0].nextCheckAt=new Date(Date.parse(now)+SIX_HOURS).toISOString();
 const unchanged=mergeReleaseFeed(first,[{...report,release:{...report.release,checkedAt:'later'}}],now);
 assert.equal(feedRevision(report),feedRevision({...report,release:{...report.release,checkedAt:'later'}}));
 assert.equal(dueReleaseEntries(unchanged,Date.parse(now)).length,0);
 const changed=mergeReleaseFeed(unchanged,[{...report,release:{...report.release,date:'2026-11-12'}}],now);
 assert.equal(dueReleaseEntries(changed,Date.parse(now)).length,1);
 assert.equal(mergeReleaseFeed(changed,[],now).length,1);
 const backlog=Array.from({length:12},(_,index)=>({...changed[0],report:{...report,release:{...report.release,source:`https://whentostream.com/film-${index}/`}}}));
 assert.equal(dueReleaseEntries(backlog,Date.parse(now),100).length,5);
});
test('automatic imports preserve native IDs and primary dates, keep tentative confidence, and retain future calendar UIDs',()=>{
 const verified=parseVerifiedReport(article,report,[identity])!;
 const imported=expansionMovie(evidence.movie,[verified.release]);assert.equal(imported.discoveredFrom,'When To Stream');assert.equal(imported.id,evidence.movie.id);
 const existing={...evidence.movie,id:'123',releaseCheckedAt:'2026-10-24T00:00:00Z',identityVerifiedAt:evidence.movie.checkedAt,releases:[{...report.release,kind:'Digital' as const,sourceName:'DVDs Release Dates',source:'https://www.dvdsreleasedates.com/movies/123/a-film',date:'2026-10-27'}]};
 const updated=expansionMovie(evidence.movie,[verified.release],existing);assert.equal(updated.id,'123');assert.equal(updated.releases.length,2);
 assert.equal(updated.releaseCheckedAt,existing.releaseCheckedAt,'A WTS publication cannot certify an independent primary-source check');
 assert.equal(expansionMovie(evidence.movie,[{...verified.release,kind:'Digital',confidence:'rumored'}],existing).releases[0].date,'2026-10-27');
 const initial=makeCalendar([imported]),changed=makeCalendar([expansionMovie(evidence.movie,[{...verified.release,date:'2026-11-12'}],imported)]);
 assert.equal(initial.match(/UID:.+/)?.[0],changed.match(/UID:.+/)?.[0]);
 assert.match(makeCalendar([expansionMovie(evidence.movie,[{...verified.release,confidence:'rumored'}])]),/STATUS:TENTATIVE/);
 assert.throws(()=>expansionMovie(evidence.movie,[{...verified.release,filmImdbId:'tt1111111'}]),/unverified/);
 assert.throws(()=>expansionMovie(evidence.movie,[verified.release],{...existing,imdbId:'tt1111111'}),/conflicting/);
 const later={...imported,id:'123',source:existing.source,releases:[existing.releases[0]]};
 const combined=mergeImportedCatalogue([later],[imported]);assert.equal(combined.length,1);assert.equal(combined[0].id,imported.id);assert.equal(combined[0].releases.length,2);
});
test('a WTS outage retains its last known window while primary dates update; a positive withdrawal removes only that report',async()=>{
 const original=globalThis.fetch,verified=parseVerifiedReport(article,report,[identity])!;
 const movie={...evidence.movie,id:'123',source:'https://www.dvdsreleasedates.com/movies/123/a-film',overview:'A known synopsis.',identityVerifiedAt:evidence.movie.checkedAt,releaseCheckedAt:'2026-10-24T00:00:00Z',releases:[verified.release]};
 const padding='<!--'+'.'.repeat(600)+'-->';
 try{
  for(const unavailable of [true,false]){
   globalThis.fetch=async url=>String(url)===movie.source?new Response('<h2>Available on Digital HD on October 27, 2026.</h2><a itemprop="sameAs" href="https://www.imdb.com/title/tt7777777/">IMDb</a>'+padding):unavailable?new Response('Unavailable',{status:503}):new Response(article.replace('is arriving on Netflix on November 11, 2026.','has no date; the release has been withdrawn.')+padding);
   const result=await refreshMovie(movie,{identities:[identity]});
   assert.equal(result.releases.find(release=>release.kind==='Digital')?.date,'2026-10-27');
   assert.equal(result.releases.some(release=>release.sourceName==='When To Stream'),unavailable);
   if(unavailable)assert.equal(result.releaseCheckedAt,movie.releaseCheckedAt);
  }
 }finally{globalThis.fetch=original;}
});
