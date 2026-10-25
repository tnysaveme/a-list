import test from 'node:test';
import assert from 'node:assert/strict';
import {cataloguePage,discoverMovies} from '../lib/catalogue-view';
import type {Movie} from '../lib/model';
const film:Movie={id:'1',title:'Film',year:'2026',source:'https://example.com',poster:'',releases:[],checkedAt:'2026-10-24T12:00:00Z'};
const make=(id:string,title:string,date?:string):Movie=>({...film,id,title,releases:date?[{kind:'Digital',date,confidence:'listed',source:film.source,sourceName:'DVDs Release Dates'}]:[]});
test('discover ordering keeps future, available and unknown films in their existing groups without mutating inputs',()=>{
 const films=[make('1','Unknown'),make('2','Available','2026-10-20'),make('3','Future','2026-11-03')];
 assert.deepEqual(discoverMovies(films,'all','release','2026-10-24').map(m=>m.id),['3','2','1']);
 assert.deepEqual(discoverMovies(films,'available','title','2026-10-24').map(m=>m.id),['2']);
 assert.deepEqual(discoverMovies(films,'soon','title','2026-10-24').map(m=>m.id),['3']);
 assert.deepEqual(films.map(m=>m.id),['1','2','3']);
});
test('unverified reports cannot leak into discovery filters from a bundled or cached snapshot',()=>{
 const report={...make('1','Legacy report','2026-10-20'),releases:[{...make('1','Legacy report','2026-10-20').releases[0],sourceName:'When To Stream'}]};
 assert.equal(discoverMovies([report],'available','release','2026-10-24').length,0);
 assert.equal(discoverMovies([report],'unknown','release','2026-10-24').length,1);
});

test('catalogue filters and search cover unloaded films while pages omit detail payloads',()=>{
 const films=Array.from({length:60},(_,index)=>({...make(String(index+1),`Film ${String(index).padStart(2,'0')}`,index<30?'2026-11-03':undefined),overview:'Long synopsis '.repeat(300),metadataCheckedAt:film.checkedAt}));
 const first=cataloguePage(films,{sort:'title'},'2026-10-24');
 const second=cataloguePage(films,{sort:'title',offset:first.nextOffset!},'2026-10-24');
 assert.equal(first.movies.length,25);assert.equal(first.filteredTotal,60);assert.equal(first.nextOffset,25);
 assert.equal(second.movies[0].id,'26');assert.equal(second.nextOffset,50);
 const last=cataloguePage(films,{sort:'title',offset:50},'2026-10-24');
 assert.equal(last.movies.length,10);assert.equal(last.nextOffset,null);
 assert.ok(first.movies.every(movie=>movie.overview===undefined&&movie.metadataCheckedAt===undefined));
 assert.ok(films[0].overview.length>3000);
 const unknown=cataloguePage(films,{filter:'unknown',sort:'title'},'2026-10-24');
 assert.equal(unknown.filteredTotal,30);assert.equal(unknown.movies[0].id,'31');
 const search=cataloguePage(films,{query:'film 59'},'2026-10-24');
 assert.equal(search.movies[0].id,'60');
 assert.equal(search.filteredTotal,1);assert.equal(search.nextOffset,null);
});

test('Coming soon sorts and displays the upcoming window rather than a previously available rental date',async()=>{
 const {releaseForView}=await import('../lib/catalogue-view');
 const earlier=make('1','Earlier streaming','2026-10-01');earlier.releases.push({...earlier.releases[0],kind:'Subscription',platform:'Netflix',date:'2026-11-01'});
 const later=make('2','Later rental','2026-11-10');
 assert.deepEqual(discoverMovies([later,earlier],'soon','release','2026-10-25').map(m=>m.id),['1','2']);
 assert.equal(releaseForView(earlier,'soon','2026-10-25')?.platform,'Netflix');assert.equal(releaseForView(earlier,'soon','2026-10-25')?.date,'2026-11-01');
 assert.equal(releaseForView(earlier,'all','2026-10-25')?.date,'2026-10-01');assert.equal(releaseForView(earlier,'available','2026-10-25')?.date,'2026-10-01');
 const reported={...earlier,releases:[earlier.releases[0],{...earlier.releases[1],confidence:'rumored' as const}]};assert.equal(releaseForView(reported,'rumored','2026-10-25')?.confidence,'rumored');
});
