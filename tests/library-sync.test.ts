import assert from 'node:assert/strict';
import test from 'node:test';
import {createClient} from '@supabase/supabase-js';
import {writeLibrary} from '../lib/library-mutations';
import {makeCalendar} from '../lib/calendar';
import type {Movie} from '../lib/model';

const movie:Movie={id:'12345',title:'Calendar test',year:'2026',poster:'',source:'https://example.com',checkedAt:'2026-10-24T00:00:00Z',releases:[{kind:'Digital',date:'2026-11-20',confidence:'listed',source:'https://example.com',sourceName:'Test'}]};
type Row={user_id:string;movie_id:string;movie:Movie;tracked:boolean;added_at:string};
function fixture(){
 const rows:Row[]=[];let writes=0;
 const db=createClient('https://library.test','test-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
  const url=new URL(String(input)),method=init?.method||'GET';
  const ids=(url.searchParams.get('id')||url.searchParams.get('movie_id')||'').slice(4,-1).split(',');
  if(url.pathname.endsWith('/a_list_movies'))return Response.json(ids.includes(movie.id)?[{id:movie.id,movie}]:[]);
  writes++;
  if(method==='POST'){
   assert.match(new Headers(init?.headers).get('Prefer')||'',/resolution=merge-duplicates/);
   assert.equal(url.searchParams.get('on_conflict'),'user_id,movie_id');
   for(const value of JSON.parse(String(init?.body))){
    const existing=rows.find(r=>r.user_id===value.user_id&&r.movie_id===value.movie_id);
    if(existing)Object.assign(existing,value);else rows.push({...value,added_at:'2026-10-24T10:00:00Z'});
   }
  }else if(method==='DELETE'){
   const owner=url.searchParams.get('user_id')?.slice(3);assert.ok(owner);
   for(let i=rows.length-1;i>=0;i--)if(rows[i].user_id===owner&&ids.includes(rows[i].movie_id))rows.splice(i,1);
  }else throw new Error('Unexpected request '+method);
  return new Response(null,{status:204});
 }}});
 return {db,rows,writes:()=>writes,calendar:()=>makeCalendar(rows.filter(r=>r.user_id==='owner'&&r.tracked).map(r=>r.movie))};
}

test('saving automatically adds events; removal and Undo mirror library membership',async()=>{
 const f=fixture();
 await writeLibrary(f.db,'owner','add',[movie.id]);
 assert.equal(f.rows[0].tracked,true);assert.match(f.calendar(),/UID:movie-12345-digital@afterlight/);
 f.rows.push({...f.rows[0],user_id:'someone-else'});
 await writeLibrary(f.db,'owner','remove',[movie.id]);
 assert.doesNotMatch(f.calendar(),/BEGIN:VEVENT/);assert.equal(f.rows.length,1);assert.equal(f.rows[0].user_id,'someone-else');
 await writeLibrary(f.db,'owner','add',[movie.id]);
 assert.match(f.calendar(),/UID:movie-12345-digital@afterlight/);assert.equal(f.rows.find(r=>r.user_id==='owner')?.tracked,true);
});

test('repeat saves repair legacy tracking without duplicating or replacing the saved timestamp',async()=>{
 const f=fixture();f.rows.push({user_id:'owner',movie_id:movie.id,movie,tracked:false,added_at:'2025-01-01T00:00:00Z'});
 await writeLibrary(f.db,'owner','add',[movie.id]);await writeLibrary(f.db,'owner','add',[movie.id]);
 assert.equal(f.rows.length,1);assert.equal(f.rows[0].tracked,true);assert.equal(f.rows[0].added_at,'2025-01-01T00:00:00Z');
});

test('missing films and independent untracking cannot partially change the library',async()=>{
 const f=fixture();
 await assert.rejects(writeLibrary(f.db,'owner','add',[movie.id,'99999']),/Film not found/);
 await assert.rejects(writeLibrary(f.db,'owner','untrack',[movie.id]),/Unknown library action/);
 assert.equal(f.writes(),0);
});
