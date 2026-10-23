import assert from 'node:assert/strict';
const base=(process.env.ALIST_BASE_URL||'http://127.0.0.1:3000').replace(/\/$/,'');
const cookie=process.env.ALIST_SESSION_COOKIE;
const login=await fetch(base+'/login');
assert.equal(login.status,200);assert.match(await login.text(),/A-List/);
const home=await fetch(base+'/',{redirect:'manual'});assert.equal(home.status,307);assert.match(home.headers.get('location'),/\/login$/);
assert.equal((await fetch(base+'/api/catalogue')).status,401);
const malformedEmail=await fetch(base+'/auth/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email:'not-an-email'})});assert.equal(malformedEmail.status,403);
const wrongOrigin=await fetch(base+'/auth/login',{method:'POST',headers:{Origin:'https://other.example','Content-Type':'application/json'},body:'{}'});assert.equal(wrongOrigin.status,403);
const invalidFeed=await fetch(base+'/api/feed/'+'0'.repeat(68)+'.ics');assert.equal(invalidFeed.status,404);
console.log('PASS: branded sign-in, protected library and API, malformed email rejection, cross-origin sign-in rejection, invalid public feed. No emails sent.');
if(!cookie){console.log('SKIP: authenticated library round trip requires ALIST_SESSION_COOKIE.');process.exit(0);}
const get=async path=>{const r=await fetch(base+'/api/'+path,{headers:{cookie}});assert.equal(r.status,200,await r.clone().text());return r.json();};
const post=async(path,body)=>{const r=await fetch(base+'/api/'+path,{method:'POST',headers:{cookie,Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,200,await r.clone().text());return r.json();};
const initial=await post('init',{});const catalog=await get('catalogue');assert.ok(catalog.movies.length>10);
const candidate=catalog.movies.find(m=>m.releases.some(r=>r.confidence==='listed')&&!initial.movies.some(s=>s.id===m.id));assert.ok(candidate);
try {
 await post('library',{action:'add',ids:[candidate.id]});
 const tracked=await post('library',{action:'track',ids:[candidate.id]});assert.ok(tracked.movies.find(m=>m.id===candidate.id).tracked);
 const response=await fetch(base+initial.feedPath);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/calendar/);assert.match(await response.text(),new RegExp('UID:movie-'+candidate.id+'-'));
 const bad=await fetch(base+'/api/library',{method:'POST',headers:{cookie,Origin:'https://different.example','Content-Type':'application/json'},body:JSON.stringify({action:'remove',ids:[candidate.id]})});assert.equal(bad.status,403);
} finally {await post('library',{action:'remove',ids:[candidate.id]});}
const after=await fetch(base+initial.feedPath);assert.doesNotMatch(await after.text(),new RegExp('UID:movie-'+candidate.id+'-'));
console.log('PASS: catalogue → save → track → anonymous .ics → remove → feed update; cross-origin writes rejected.');
