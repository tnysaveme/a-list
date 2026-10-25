import {createHash} from 'node:crypto';
import {imdbId,titleKey,verifiedIdentityId} from './film-identity';
import {evidenceAgreement,type SourceProfile} from './release-profile';
import type {MetadataEvidence} from './metadata';
import type {Movie,Release} from './model';
import type {ReleaseReport} from './sources';
import type {ReviewedReportIdentity} from './reviewed-report-identities';

export const MATCH_RULE_VERSION=1;
export const SIX_HOURS=6*3600_000;
export type MatchMethod='reviewed'|'structured'|'corroborated';
export type FeedEntry={report:ReleaseReport;revision:string;seenAt:string;checkedAt?:string;nextCheckAt?:string;sourceId?:string;movieId?:string;outcome?:string};
export type MatchRow={source_id:string;profile:SourceProfile;fingerprint:string;status:string;approved_imdb_id:string|null;movie_id:string|null;reviewed_fingerprint:string|null;reviewed_at:string|null;rationale:string|null;checked_at:string;profile_checked_at:string|null;match_method:MatchMethod;rule_version:number;reports:ReleaseReport[];suggestions:MetadataEvidence[]};
export class UnresolvedRelease extends Error{}

/** Credit inference is deliberately distinct from a source-supplied global ID. */
export function automaticEvidence(profile:SourceProfile,candidates:MetadataEvidence[],explicitId?:string):MetadataEvidence{
 if(explicitId&&!imdbId(explicitId))throw new UnresolvedRelease('conflicting_identity');
 const unique=[...new Map(candidates.map(candidate=>[candidate.movie.id,candidate])).values()];
 const matches=unique.filter(candidate=>{
  const agreement=evidenceAgreement(profile,candidate);
  if(!imdbId(candidate.movie.id)||!agreement.title||!agreement.year)return false;
  if(explicitId)return candidate.movie.id===explicitId;
  return agreement.director&&new Set(agreement.cast.map(titleKey)).size>=2;
 });
 if(matches.length!==1)throw new UnresolvedRelease(matches.length?'ambiguous_identity':'insufficient_evidence');
 return matches[0];
}
export function cachedIdentity(row:MatchRow):ReviewedReportIdentity|undefined{
 if(row.status!=='approved'||!imdbId(row.approved_imdb_id)||row.fingerprint!==row.reviewed_fingerprint)return;
 if(row.match_method==='corroborated'&&row.rule_version!==MATCH_RULE_VERSION)return;
 return {sourceFilmId:row.source_id,sourceFilmUrl:row.profile.sourceFilmUrl,title:row.profile.title,year:row.profile.year,imdbId:row.approved_imdb_id,reviewedAt:row.reviewed_at||row.checked_at,method:row.match_method||'reviewed',profileFingerprint:row.fingerprint,evidence:{metadata:`https://v3-cinemeta.strem.io/meta/movie/${row.approved_imdb_id}.json`,releaseSource:`https://www.imdb.com/title/${row.approved_imdb_id}/`,corroboration:row.rationale||'Persisted source identity'}};
}
export function activeReleaseIdentities(rows:MatchRow[],seeds:readonly ReviewedReportIdentity[]){
 const known=new Map(seeds.map(identity=>[identity.sourceFilmId,identity]));
 for(const row of rows){const identity=cachedIdentity(row);if(identity)known.set(row.source_id,identity);else known.delete(row.source_id);}
 return [...known.values()];
}
export function inferredIdentity(profile:SourceProfile,evidence:MetadataEvidence,method:MatchMethod,now:string,fingerprint:string):ReviewedReportIdentity{
 return {sourceFilmId:profile.sourceFilmId,sourceFilmUrl:profile.sourceFilmUrl,title:profile.title,year:profile.year,imdbId:evidence.movie.id,reviewedAt:now,method,profileFingerprint:fingerprint,evidence:{metadata:evidence.movie.overviewSource||evidence.movie.source,releaseSource:evidence.movie.source,corroboration:method==='structured'?'Explicit source Movie identity':`Rule ${MATCH_RULE_VERSION}: unique title/year, director and two distinct shared cast members`}};
}
export function expansionMovie(metadata:Movie,reports:Release[],existing?:Movie):Movie{
 const id=metadata.imdbId||metadata.id;
 if(!imdbId(id)||existing&&verifiedIdentityId(existing)!==id)throw new UnresolvedRelease('conflicting_catalogue_identity');
 if(!reports.length||reports.some(report=>report.filmImdbId!==id))throw new UnresolvedRelease('unverified_report');
 const movie=existing||metadata,replaced=new Set(reports.map(report=>report.source));
 const releases=movie.releases.filter(release=>!replaced.has(release.source));
 const kinds=new Set<string>();
 for(const report of reports){
  if(kinds.has(report.kind))continue;kinds.add(report.kind);
  const index=releases.findIndex(release=>release.kind===report.kind);
  if(index<0)releases.push(report);else if(releases[index].sourceName==='When To Stream'||releases[index].confidence==='rumored')releases[index]=report;
 }
 return {...movie,discoveredFrom:movie.discoveredFrom||(!existing||movie.id.startsWith('tt')?'When To Stream':undefined),imdbId:id,identityVerifiedAt:new Date().toISOString(),checkedAt:new Date().toISOString(),releaseCheckedAt:existing?existing.releaseCheckedAt:new Date().toISOString(),releases};
}
export function feedRevision(report:ReleaseReport){
 const {checkedAt:_,...release}=report.release;void _;
 return createHash('sha256').update(JSON.stringify({title:report.title,year:report.year,publishedAt:report.publishedAt,release})).digest('hex');
}
export function mergeReleaseFeed(previous:FeedEntry[],reports:ReleaseReport[],now:string):FeedEntry[]{
 const old=new Map(previous.map(entry=>[entry.report.release.source,entry]));
 const fresh=[...new Map(reports.map(report=>[report.release.source,report])).values()].map(report=>{
  const revision=feedRevision(report),entry=old.get(report.release.source);old.delete(report.release.source);
  return entry?.revision===revision?{...entry,report,seenAt:now}:{report,revision,seenAt:now};
 });
 return [...fresh,...[...old.values()].filter(entry=>Date.parse(entry.seenAt)>Date.parse(now)-7*86400_000)].slice(0,80);
}
export function dueReleaseEntries(entries:FeedEntry[],now:number,limit=5){
 return entries.filter(entry=>!entry.nextCheckAt||Date.parse(entry.nextCheckAt)<=now)
  .sort((a,b)=>Number(!!a.checkedAt)-Number(!!b.checkedAt)||(Date.parse(a.checkedAt||'')||0)-(Date.parse(b.checkedAt||'')||0))
  .slice(0,Math.min(5,Math.max(0,limit)));
}
