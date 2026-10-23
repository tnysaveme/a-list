import {validMovieId,type Movie} from './model';
import {getMetadata,imdbId} from './metadata';
import {fetchSource,parseDetail,parseListing,parseReportDetail,normalized,parseSynopsis} from './sources';

export async function refreshMovie(movie:Movie,{discoverReleases=true}={}):Promise<Movie>{
 if(!validMovieId(movie.id))throw new Error('Invalid film ID');
 const signal=AbortSignal.timeout(16000);
 let result={...movie};
 const source=new URL(movie.source);
 const dvd=source.protocol==='https:'&&source.hostname==='www.dvdsreleasedates.com'&&/^\/movies\/\d{1,8}\//.test(source.pathname);
 if(dvd&&!imdbId(movie.id)&&source.pathname.split('/')[2]!==movie.id)throw new Error('Film source identity mismatch');
 if(!dvd&&!(imdbId(movie.id)&&source.protocol==='https:'&&source.hostname==='www.imdb.com'&&source.pathname===`/title/${movie.id}/`))throw new Error('Invalid film source');
 if(dvd){
  const html=await fetchSource(movie.source,{signal});
  if(imdbId(movie.id)&&html.match(/imdb\.com\/title\/(tt\d{7,10})\b/i)?.[1]!==movie.id)throw new Error('Film source identity mismatch');
  try{result=parseDetail(html,movie);}catch(error){
   const overview=parseSynopsis(html),id=html.match(/imdb\.com\/title\/(tt\d{7,10})\b/i)?.[1];
   if(!overview&&!id)throw error;
   // A page with no recognized release heading can still supply a synopsis.
   result={...movie,imdbId:id||movie.imdbId,...(overview?{overview,overviewSource:movie.source}:{}),metadataCheckedAt:new Date().toISOString()};
  }
 }
 const id=result.imdbId||(imdbId(movie.id)?movie.id:undefined);
 if(id&&(!dvd||!result.overview)){
  try{const meta=await getMetadata(id,signal);result={...result,imdbId:id,year:result.year||meta.year,poster:result.poster||meta.poster,overview:!dvd?meta.overview||result.overview:result.overview||meta.overview,overviewSource:!dvd&&meta.overview?meta.overviewSource:result.overview?result.overviewSource:meta.overviewSource,metadataCheckedAt:meta.metadataCheckedAt};}
  catch(error){if(!dvd&&!result.overview)throw error;}
 }
 if(!dvd&&discoverReleases&&id){
  // A broad metadata match does not establish a US digital release. Find an
  // independent release listing and verify its IMDb identity before importing dates.
  const html=await fetchSource('https://www.dvdsreleasedates.com/search/',{method:'POST',signal,headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({searchStr:movie.title}).toString()});
  const matches=parseListing(html,false).filter(m=>normalized(m.title)===normalized(movie.title)&&(!m.year||!movie.year||m.year===movie.year));
  for(const match of matches.slice(0,2)){
   const detail=await fetchSource(match.source,{signal});
   if(detail.match(/imdb\.com\/title\/(tt\d{7,10})\b/i)?.[1]!==id)continue;
   result=parseDetail(detail,{...result,source:match.source});break;
  }
  result.releaseCheckedAt=new Date().toISOString();
 }
 if(discoverReleases){
  const reports=movie.releases.filter(r=>r.sourceName==='When To Stream');
  const refreshed=await Promise.all(reports.map(async r=>parseReportDetail(await fetchSource(r.source,{signal}),r)));
  result.releases=result.releases.filter(r=>r.sourceName!=='When To Stream');
  for(const report of refreshed)if(report&&!result.releases.some(r=>r.kind===report.kind))result.releases.push(report);
 }
 // Loading a synopsis must not change the previously checked release windows.
 return {...result,metadataCheckedAt:new Date().toISOString(),synopsisCheckedAt:new Date().toISOString(),...(!discoverReleases?{releases:movie.releases,checkedAt:movie.checkedAt,releaseCheckedAt:movie.releaseCheckedAt}: {})};
}
