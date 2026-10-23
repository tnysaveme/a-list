import type { Movie } from './model';
// Keep the legacy UID namespace stable across the A-List rename.
const EVENT_UID_NAMESPACE='afterlight';
// Bump the format revision when existing subscribers need an event update.
const CALENDAR_FORMAT_UPDATED_AT='2026-10-23T18:37:52.000Z';
const escape = (s:string)=>s.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
function fold(line:string):string {
 let out='',bytes=0;
 for(const char of line) { const n=new TextEncoder().encode(char).length; if(bytes+n>75){out+='\r\n ';bytes=1;} out+=char;bytes+=n; }
 return out;
}
export function makeCalendar(movies:Movie[], options:{includeRumors?:boolean; now?:Date}={}):string {
 const now=options.now||new Date(); const stamp=now.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z/,'Z');
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//A-List//US Movie Releases//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:A-List · Movie nights','X-WR-TIMEZONE:America/New_York','REFRESH-INTERVAL;VALUE=DURATION:PT6H','X-PUBLISHED-TTL:PT6H'];
 for(const movie of movies) for(const release of movie.releases) {
   if(release.confidence==='rumored'&&!options.includeRumors)continue;
   if(!/^\d{4}-\d{2}-\d{2}$/.test(release.date))continue;
   const end=new Date(`${release.date}T12:00:00Z`);if(Number.isNaN(end.getTime())||end.toISOString().slice(0,10)!==release.date)continue;end.setUTCDate(end.getUTCDate()+1);
   const modified=movie.checkedAt>CALENDAR_FORMAT_UPDATED_AT?movie.checkedAt:CALENDAR_FORMAT_UPDATED_AT;
   const summary=`${release.confidence==='rumored'?'[Rumored] ':''}${movie.title} · ${release.platform||release.kind}`;
   lines.push('BEGIN:VEVENT',`UID:movie-${movie.id}-${release.kind.toLowerCase()}@${EVENT_UID_NAMESPACE}`, `DTSTAMP:${stamp}`,`LAST-MODIFIED:${modified.replace(/[-:]/g,'').replace(/\.\d{3}Z/,'Z')}`,`DTSTART;VALUE=DATE:${release.date.replace(/-/g,'')}`,`DTEND;VALUE=DATE:${end.toISOString().slice(0,10).replace(/-/g,'')}`,`SUMMARY:${escape(summary)}`,`DESCRIPTION:${escape(`US ${release.kind} release${release.platform?` on ${release.platform}`:''}. ${release.confidence==='rumored'?'Reported; not confirmed.':'Date listed by source; subject to change.'}\nSource: ${release.sourceName}\n${release.source}\nChecked: ${movie.checkedAt.slice(0,10)}`)}`,`URL:${release.source}`,`STATUS:${release.confidence==='rumored'?'TENTATIVE':'CONFIRMED'}`,'TRANSP:TRANSPARENT',
     // An absolute UTC trigger preserves 1pm GMT across device zones and DST.
     'BEGIN:VALARM','ACTION:DISPLAY',`TRIGGER;VALUE=DATE-TIME:${release.date.replace(/-/g,'')}T130000Z`,`DESCRIPTION:${escape(summary)}`,'END:VALARM','END:VEVENT');
 }
 lines.push('END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';
}
