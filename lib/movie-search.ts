import {fetchSource,parseListing,normalized} from './sources';
import {mergeSearchProviders,searchMetadata} from './metadata';

export async function searchProviders(query:string){
 const providers=await Promise.allSettled([
  fetchSource('https://www.dvdsreleasedates.com/search/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({searchStr:query}).toString()}).then(html=>parseListing(html,false)),
  searchMetadata(query),
 ]);
 if(providers.every(r=>r.status==='rejected'))throw new Error('Movie search sources unavailable');
 const listing=providers[0].status==='fulfilled'?providers[0].value:[],metadata=providers[1].status==='fulfilled'?providers[1].value:[];
 const movies=mergeSearchProviders(listing,metadata).sort((a,b)=>Number(normalized(b.title)===normalized(query))-Number(normalized(a.title)===normalized(query))).slice(0,24);
 return {movies,metadata,degraded:providers.some(r=>r.status==='rejected')};
}
