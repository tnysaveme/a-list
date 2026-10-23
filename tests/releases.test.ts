import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCalendar } from '../lib/calendar';
import { parseListing,parseDetail,parseReports,dateFromText } from '../lib/sources';
import { mergeMovies,nextRelease,type Movie } from '../lib/model';
const sample:Movie={id:'123',title:'A film, with; punctuation',year:'2026',poster:'',source:'https://www.dvdsreleasedates.com/movies/123/a-film',checkedAt:'2026-10-23T12:00:00.000Z',releases:[{kind:'Digital',date:'2026-11-03',confidence:'listed',source:'https://www.dvdsreleasedates.com/movies/123/a-film',sourceName:'DVDs Release Dates'}]};
test('digital listings are associated with their own day and theatrical listings stay separate',()=>{
 const html=`<td class='reldate future'>Tuesday November 3, 2026<div>next week</div></td><td class='dvdcell'><a href='/movies/123/a-film'><img alt='A Film DVD Release Date' src='/posters/110/A/A-Film-2026.jpg'/></a></td><td class='reldate future'>Tuesday November 10, 2026</td><td class='dvdcell'><a href='/movies/124/another-film'><img alt='Another Film DVD Release Date' src='/posters/110/A/Another-Film-2026.jpg'/></a></td>`;
 const movies=parseListing(html,true);assert.equal(movies.length,2);assert.equal(movies[0].releases[0].date,'2026-11-03');assert.equal(movies[1].releases[0].date,'2026-11-10');assert.equal(parseListing(html,false)[0].releases.length,0);
});
test('DVD and Blu-ray dates are never used as digital dates',()=>{
 const movie=parseDetail('<h2>DVD and Blu-ray release date is set for December 15, 2026.</h2>',sample);assert.equal(movie.releases.length,0);
 const actual=parseDetail('<h2>DVD release December 15, 2026 and available on Digital HD from Amazon and iTunes on <span>November 3, 2026</span>.</h2>',sample);assert.equal(actual.releases[0].date,'2026-11-03');
});
test('rumor reporting is retained as tentative, never promoted to a confirmed listing',()=>{
 const reports=parseReports(`<item><title>THAT FILM Digital Streaming Release Date Revealed</title><link>https://whentostream.com/that-film/</link><description><![CDATA[According to our sources, expected on November 3rd, 2026. Neither announced nor confirmed.]]></description></item>`);
 assert.equal(reports[0].release.confidence,'rumored');assert.equal(reports[0].release.date,'2026-11-03');
});
test('invalid dates fail safely',()=>{assert.equal(dateFromText('February 31, 2026'),null);assert.equal(dateFromText('January 99, 2026'),null);assert.equal(dateFromText('coming soon'),null);});
test('merging theatre and digital listings preserves sourced digital releases',()=>{const merged=mergeMovies([sample,{...sample,theatrical:'2026-09-01',releases:[]}]);assert.equal(merged[0].releases.length,1);});
test('calendar excludes rumors by default and uses tentative status when opted in',()=>{
 const rumor={...sample,releases:sample.releases.map(r=>({...r,confidence:'rumored' as const}))};assert.doesNotMatch(makeCalendar([rumor]),/BEGIN:VEVENT/);assert.match(makeCalendar([rumor],{includeRumors:true}),/STATUS:TENTATIVE/);
});
test('stable IDs survive date changes; all-day end is exclusive across year boundaries',()=>{
 const changed={...sample,releases:sample.releases.map(r=>({...r,date:'2026-12-31'}))};const a=makeCalendar([sample]);const b=makeCalendar([changed]);assert.equal(a.match(/UID:.+/)?.[0],b.match(/UID:.+/)?.[0]);assert.match(b,/DTEND;VALUE=DATE:20270101/);assert.match(a,/SUMMARY:A film\\, with\\; punctuation/);
});
test('calendar content is escaped and UTF-8 lines are folded at 75 bytes',()=>{
 const long={...sample,title:'Cinema 🎬 '.repeat(30)+'\nBEGIN:VEVENT'};const calendar=makeCalendar([long]);assert.equal((calendar.match(/\r\nBEGIN:VEVENT/g)||[]).length,1);for(const line of calendar.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);assert.match(calendar,/\\nBEGIN:VEVENT/);
});
test('unknown films do not create fake events; next release chooses upcoming window',()=>{assert.doesNotMatch(makeCalendar([{...sample,releases:[]}]),/BEGIN:VEVENT/);assert.equal(nextRelease({...sample,releases:[...sample.releases,{...sample.releases[0],kind:'Subscription',date:'2026-12-01'}]},'2026-11-15')?.kind,'Subscription');});
test('each dated release gets a display alert at 1pm GMT without changing its all-day date',()=>{
 const film={...sample,releases:[...sample.releases,{...sample.releases[0],kind:'Subscription' as const,date:'2027-07-01'}]};
 const calendar=makeCalendar([film]).replace(/\r\n /g,'');
 const events=calendar.split('BEGIN:VEVENT').slice(1);
 assert.equal(events.length,2);
 for(const [index,event] of events.entries()){
  const day=film.releases[index].date.replace(/-/g,'');
  assert.match(event,new RegExp(`DTSTART;VALUE=DATE:${day}\\r\\n`));
  assert.match(event,new RegExp(`BEGIN:VALARM\\r\\nACTION:DISPLAY\\r\\nTRIGGER;VALUE=DATE-TIME:${day}T130000Z\\r\\n`));
  assert.equal((event.match(/BEGIN:VALARM/g)||[]).length,1);
  assert.match(event,/DESCRIPTION:A film\\, with\\; punctuation/);
 }
});
test('an alert follows a changed release date and excluded rumors do not leave orphan alerts',()=>{
 const changed={...sample,releases:sample.releases.map(r=>({...r,date:'2027-01-01'}))};
 const calendar=makeCalendar([changed]);
 assert.match(calendar,/TRIGGER;VALUE=DATE-TIME:20270101T130000Z/);
 assert.doesNotMatch(calendar,/20261103T130000Z/);
 assert.match(calendar,/DTEND;VALUE=DATE:20270102/);
 const rumor={...sample,releases:sample.releases.map(r=>({...r,confidence:'rumored' as const}))};
 assert.doesNotMatch(makeCalendar([rumor]),/VALARM|TRIGGER/);
 assert.match(makeCalendar([rumor],{includeRumors:true}),/BEGIN:VALARM/);
 assert.doesNotMatch(makeCalendar([{...sample,releases:[{...sample.releases[0],date:'2026-02-31'}]}]),/VALARM|VEVENT/);
});
