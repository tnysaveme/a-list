import {mergeMovies} from './model';
import {fetchSource,parseListing,parseReports} from './sources';
import {enrichCatalogueReports} from './source-verification';
import type {ReviewedReportIdentity} from './reviewed-report-identities';

// Include the last twelve months so a theatrical listing cannot hide an
// already-released film just because its digital date was in an earlier month.
export function digitalListingUrls(now:Date){
 return Array.from({length:13},(_,i)=>{
  const month=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+i-11,1));
  const name=month.toLocaleString('en-US',{month:'long',timeZone:'UTC'}).toLowerCase();
  return `https://www.dvdsreleasedates.com/digital-releases/${month.getUTCFullYear()}/${month.getUTCMonth()+1}/digital-hd-releases-${name}-${month.getUTCFullYear()}`;
 });
}

export async function loadCatalogue(now=new Date(),identities?:readonly ReviewedReportIdentity[],reportFeed?:Promise<string>,{enrichReports=true,signal}:{enrichReports?:boolean;signal?:AbortSignal}={}){
 const urls=digitalListingUrls(now);
 const pages=await Promise.allSettled([
  ...urls.map(url=>fetchSource(url,{cache:'no-store',signal})),
  fetchSource(`https://www.dvdsreleasedates.com/new-movies-${now.getUTCFullYear()}/`,{cache:'no-store',signal}),
  enrichReports?reportFeed||fetchSource('https://whentostream.com/feed/',{cache:'no-store',signal}):Promise.resolve(''),
 ]);
 // Current listings are required; an unavailable archive or reporting feed
 // must not block updates from the other release sources.
 if(pages[11].status==='rejected'||pages[13].status==='rejected')throw new Error('Current release listings unavailable');
 const movies=mergeMovies(pages.slice(0,14).flatMap((page,i)=>page.status==='fulfilled'?parseListing(page.value,i<13):[]));
 if(movies.length<10)throw new Error('Source format or coverage changed');
 const feed=pages[14],reports=feed.status==='fulfilled'?parseReports(feed.value):[];
 const enriched=enrichReports?await enrichCatalogueReports(movies,reports,identities,signal):{movies,decisions:{matched:0,unresolved:0,ambiguous:0,conflict:0}};
 if(reports.length)console.info(JSON.stringify({event:'release_report_identity',...enriched.decisions}));
 if(pages.some(page=>page.status==='rejected'))console.warn(JSON.stringify({event:'catalogue_partial_sources',failed:pages.filter(page=>page.status==='rejected').length}));
 return enriched.movies;
}
