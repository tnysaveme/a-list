import 'server-only';
import {adminDb} from './supabase/admin';
import {checked} from './db-result';
import {cached,remember,cache} from './infrastructure';
import {activeReleaseIdentities,type MatchRow} from './release-automation';
import {reviewedReportIdentities,type ReviewedReportIdentity} from './reviewed-report-identities';
import type {Movie} from './model';

export async function releaseIdentities():Promise<ReviewedReportIdentity[]>{
 const hit=await cached<ReviewedReportIdentity[]>('release-identities:v2');if(hit)return hit;
 const rows:MatchRow[]=[];const db=adminDb();
 for(let offset=0;;offset+=500){
  const page=checked(await db.from('a_list_release_candidates').select('source_id,profile,fingerprint,status,approved_imdb_id,reviewed_fingerprint,reviewed_at,rationale,checked_at,match_method,rule_version').order('source_id').range(offset,offset+499)) as MatchRow[];
  rows.push(...page);if(page.length<500)break;
 }
 const identities=activeReleaseIdentities(rows,reviewedReportIdentities);await remember('release-identities:v2',identities,60);return identities;
}
export type ReleaseImportRow={id:string;movie:Movie;updated_at:string};
export async function releaseImports():Promise<ReleaseImportRow[]>{
 const db=adminDb(),rows:ReleaseImportRow[]=[];
 for(let offset=0;;offset+=500){
  const page=checked(await db.from('a_list_movies').select('id,movie,updated_at').eq('movie->>discoveredFrom','When To Stream').order('id').range(offset,offset+499)) as ReleaseImportRow[]||[];
  rows.push(...page);if(page.length<500)break;
 }
 return rows;
}
export async function invalidateReleaseCaches(){
 try{await cache().del('alist:release-identities:v2','alist:approved-identities:v1','alist:catalogue');}catch{console.warn(JSON.stringify({event:'release_cache_invalidation_failed'}));}
}
