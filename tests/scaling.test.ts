import assert from 'node:assert/strict';
import test from 'node:test';
import {pageOptions} from '../lib/pagination';
import {feedDocument,feedResponse} from '../lib/feed-cache';
import {makeCalendar} from '../lib/calendar';
import type {Movie} from '../lib/model';
import {sameOrigin} from '../lib/request-origin';
test('origin checking accepts exact loopback hosts locally and exact canonical origin on Vercel',()=>{
 const local=new Request('http://localhost:3000/api/init',{headers:{origin:'http://127.0.0.1:3000',host:'127.0.0.1:3000'}});
 assert.equal(sameOrigin(local,{vercel:false,appUrl:undefined}),true);
 assert.equal(sameOrigin(local,{vercel:true,appUrl:'https://a-list.example'}),false);
 const crossSite=new Request('http://localhost:3000/api/init',{headers:{origin:'http://127.0.0.1:3001',host:'127.0.0.1:3000'}});
 assert.equal(sameOrigin(crossSite,{vercel:false,appUrl:undefined}),false);
 const live=new Request('http://internal/api/init',{headers:{origin:'https://a-list.example',host:'a-list.example'}});
 assert.equal(sameOrigin(live,{vercel:true,appUrl:'https://a-list.example'}),true);
 assert.equal(sameOrigin(new Request('https://a-list.example/api/init',{headers:{origin:'https://evil.example'}}),{vercel:true,appUrl:'https://a-list.example'}),false);
});
test('library page inputs are bounded and sort/filter values cannot become SQL',()=>{
 assert.deepEqual(pageOptions(new URL('https://example.com/api/library?sort=title&filter=unknown&offset=25')),{sort:'title',filter:'unknown',offset:25,limit:25,tracked:false});
 for(const query of ['offset=-1','offset=NaN','offset=100001','offset=1.5','sort=drop%20table','filter=anything'])assert.throws(()=>pageOptions(new URL('https://example.com/?'+query)));
});
test('cached calendars support weak ETags and give If-None-Match precedence over dates',async()=>{
 const document=feedDocument('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n','2026-10-23T13:00:00.123Z');
 assert.equal(feedResponse(new Request('https://example.com',{headers:{'If-None-Match':`W/${document.etag}`}}),document).status,304);
 assert.equal(feedResponse(new Request('https://example.com',{headers:{'If-Modified-Since':'Fri, 23 Oct 2026 13:00:00 GMT'}}),document).status,304);
 const changed=feedResponse(new Request('https://example.com',{headers:{'If-None-Match':'"different"','If-Modified-Since':'Fri, 23 Oct 2026 13:00:00 GMT'}}),document);
 assert.equal(changed.status,200);assert.equal(await changed.text(),document.body);
 assert.equal(changed.headers.get('Cache-Control'),'private, no-cache');
 assert.equal(feedResponse(new Request('https://example.com',{headers:{'If-Modified-Since':'invalid'}}),document).status,200);
});
test('calendar generation is deterministic for a source revision and keeps the GMT alarm',()=>{
 const movie:Movie={id:'1',title:'Test film',year:'2026',source:'https://example.com',poster:'',checkedAt:'2026-10-23T12:00:00.000Z',releases:[{kind:'Digital',date:'2026-11-20',confidence:'listed',source:'https://example.com',sourceName:'Test source'}]};
 const options={now:new Date('2026-10-23T13:00:00Z')};
 const first=makeCalendar([movie],options),second=makeCalendar([movie],options);
 assert.equal(feedDocument(first,options.now.toISOString()).etag,feedDocument(second,options.now.toISOString()).etag);
 assert.match(first,/TRIGGER;VALUE=DATE-TIME:20261120T130000Z/);
 movie.releases[0].date='2026-11-21';assert.notEqual(makeCalendar([movie],options),first);
});
