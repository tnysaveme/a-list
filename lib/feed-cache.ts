import {createHash} from 'node:crypto';
export type FeedDocument={body:string;etag:string;modifiedAt:string};
export function feedDocument(body:string,modifiedAt:string):FeedDocument{return {body,etag:`"${createHash('sha256').update(body).digest('hex')}"`,modifiedAt};}
export function feedResponse(request:Request,document:FeedDocument){
 const headers={'Content-Type':'text/calendar; charset=utf-8','Cache-Control':'private, no-cache','Content-Disposition':'inline; filename="a-list.ics"','Referrer-Policy':'no-referrer','ETag':document.etag,'Last-Modified':new Date(document.modifiedAt).toUTCString()};
 const tags=request.headers.get('if-none-match');
 const since=request.headers.get('if-modified-since');
 const unchanged=tags?tags.split(',').some(tag=>tag.trim()==='*'||tag.trim().replace(/^W\//,'')===document.etag):since!==null&&Number.isFinite(Date.parse(since))&&Math.floor(Date.parse(document.modifiedAt)/1000)<=Math.floor(Date.parse(since)/1000);
 return new Response(unchanged?null:document.body,{status:unchanged?304:200,headers});
}
