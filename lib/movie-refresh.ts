import {validMovieId,type Movie} from './model';
import {getMetadata,imdbId} from './metadata';
import {fetchSource,parseDetail,parseSearchResults,parseSynopsis} from './sources';
import {fetchVerifiedReport} from './source-verification';
import {titleKey,identityId,verifiedIdentityId,conflictingIdentity} from './film-identity';
import {listingImdbId} from './source-identity';
import type {ReviewedReportIdentity} from './reviewed-report-identities';

export type SourceResult={source:'primary'|'wts';success:boolean};
export async function refreshMovie(movie:Movie,{discoverReleases=true,identities,signal:parent,onSourceResult}:{discoverReleases?:boolean;identities?:readonly ReviewedReportIdentity[];signal?:AbortSignal;onSourceResult?:(result:SourceResult)=>void}={}):Promise<Movie>{
 if(!validMovieId(movie.id))throw new Error('Invalid film ID');
 if(conflictingIdentity(movie))throw new Error('Film source identity mismatch');
 const deadline=AbortSignal.timeout(16000),signal=parent?AbortSignal.any([parent,deadline]):deadline;
 const requestOptions={signal,...(discoverReleases?{cache:'no-store' as const}:{})};
 const source=new URL(movie.source);
 const dvd=source.protocol==='https:'&&source.hostname==='www.dvdsreleasedates.com'&&/^\/movies\/\d{1,8}\//.test(source.pathname);
 if(dvd&&!imdbId(movie.id)&&source.pathname.split('/')[2]!==movie.id)throw new Error('Film source identity mismatch');
 if(!dvd&&!(imdbId(movie.id)&&source.protocol==='https:'&&source.hostname==='www.imdb.com'&&source.pathname===`/title/${movie.id}/`))throw new Error('Invalid film source');
 const reports=discoverReleases?[...new Map(movie.releases.filter(r=>r.sourceName==='When To Stream').map(r=>[r.source,r])).values()]:[];
 const profiles=new Map<string,Promise<string>>();
 // Independent source requests start together so a slow primary cannot consume WTS's deadline.
 const reportWork=Promise.allSettled(reports.map(async release=>{
  const report=await fetchVerifiedReport({title:movie.title,year:movie.year,imdbId:identityId(movie),release},identities,signal,profiles,true);
  return report&&report.imdbId===identityId(movie)?report.release:null;
 }));
 let result={...movie},primaryError:unknown;
 try{
  if(dvd){
   const html=await fetchSource(movie.source,requestOptions);
   if(verifiedIdentityId(movie)&&listingImdbId(html)!==verifiedIdentityId(movie))throw new Error('Film source identity mismatch');
   try{result=parseDetail(html,movie);}catch(error){
    if(discoverReleases)throw error;
    const overview=parseSynopsis(html),id=listingImdbId(html);
    if(!overview&&!id)throw error;
    const repaired=!!id&&!!movie.imdbId&&id!==movie.imdbId;
    result={...movie,imdbId:id,identityVerifiedAt:id?new Date().toISOString():undefined,
     ...(repaired?{overview:undefined,overviewSource:undefined}:{}),
     ...(overview?{overview,overviewSource:movie.source}:{}),metadataCheckedAt:new Date().toISOString()};
   }
  }
  const id=result.imdbId||(imdbId(movie.id)?movie.id:undefined);
  if(id&&(!dvd||!result.overview)){
   try{const meta=await getMetadata(id,signal);result={...result,imdbId:id,year:result.year||meta.year,poster:result.poster||meta.poster,overview:!dvd?meta.overview||result.overview:result.overview||meta.overview,overviewSource:!dvd&&meta.overview?meta.overviewSource:result.overview?result.overviewSource:meta.overviewSource,metadataCheckedAt:meta.metadataCheckedAt};}
   catch(error){if(!dvd&&!result.overview)throw error;}
  }
  if(!dvd&&discoverReleases&&id){
   const html=await fetchSource('https://www.dvdsreleasedates.com/search/',{...requestOptions,method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({searchStr:movie.title}).toString()});
   const matches=parseSearchResults(html).filter(m=>titleKey(m.title)===titleKey(movie.title)&&(!m.year||!movie.year||m.year===movie.year));
   for(const match of matches.slice(0,2)){
    const detail=await fetchSource(match.source,requestOptions);
    if(listingImdbId(detail)!==id)continue;
    result=parseDetail(detail,{...result,source:match.source});break;
   }
   result.releaseCheckedAt=new Date().toISOString();
  }
  if(discoverReleases)onSourceResult?.({source:'primary',success:true});
 }catch(error){primaryError=error;result={...movie};if(discoverReleases)onSourceResult?.({source:'primary',success:false});}
 const refreshed=await reportWork;
 if(discoverReleases){
  result.releases=result.releases.filter(r=>r.sourceName!=='When To Stream');
  for(const [index,outcome] of refreshed.entries()){
   const report=outcome.status==='fulfilled'?outcome.value:reports[index];
   if(report&&report.filmImdbId===verifiedIdentityId(result)&&!result.releases.some(r=>r.kind===report.kind))result.releases.push(report);
  }
  if(reports.length)onSourceResult?.({source:'wts',success:refreshed.every(r=>r.status==='fulfilled')});
  if(primaryError||refreshed.some(r=>r.status==='rejected'))result.releaseCheckedAt=movie.releaseCheckedAt;
 }
 if(primaryError&&!refreshed.some(r=>r.status==='fulfilled'))throw primaryError;
 return {...result,metadataCheckedAt:new Date().toISOString(),synopsisCheckedAt:new Date().toISOString(),...(!discoverReleases?{releases:movie.releases,checkedAt:movie.checkedAt,releaseCheckedAt:movie.releaseCheckedAt}: {})};
}
