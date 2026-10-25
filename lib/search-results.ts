import {availableRelease,displayRelease,type Movie} from './model';

export function searchMatches(catalogue:Movie[],results:Movie[],query:string,today:string):Movie[]{
 const term=query.trim().toLowerCase();
 if(term.length<2)return catalogue.filter(m=>m.theatrical&&m.theatrical>=today).slice(0,5);
 const local=catalogue.filter(m=>m.title.toLowerCase().includes(term));
 // Search responses contain canonical metadata. A catalogue snapshot must not replace it,
 // including when a newer response removes a date that a source has withdrawn.
 const fresh=new Map(results.map(m=>[m.id,m]));
 return [...results,...local.filter(m=>!fresh.has(m.id))].slice(0,24);
}

export function searchReleaseSummary(movie:Movie,today:string):string{
 const available=availableRelease(movie,today);
 const release=displayRelease(movie,today);
 if(!release)return 'Home release date not listed';
 const date=new Date(`${release.date}T12:00:00Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
 const window=release.platform||(release.kind==='Subscription'?'Subscription':release.kind==='PVOD'?'Premium rental/purchase':'Digital rental/purchase');
 return `${window} · ${release.confidence==='rumored'?'Reported ':available?'Available since ':''}${date}`;
}
