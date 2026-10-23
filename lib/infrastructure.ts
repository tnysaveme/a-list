import 'server-only';
import {createHmac,randomUUID} from 'node:crypto';
import {isIP} from 'node:net';
import {Redis} from '@upstash/redis';
import {Ratelimit} from '@upstash/ratelimit';
let redis:Redis|undefined;
export function cache(){
 if(!process.env.UPSTASH_REDIS_REST_URL||!process.env.UPSTASH_REDIS_REST_TOKEN)throw new Error('Shared cache is not configured');
 return redis??=new Redis({url:process.env.UPSTASH_REDIS_REST_URL,token:process.env.UPSTASH_REDIS_REST_TOKEN,retry:{retries:1,backoff:()=>100}});
}
export function privateKey(value:string){
 const salt=process.env.ALIST_KEY_SALT;if(!salt)throw new Error('Private cache salt is not configured');
 return createHmac('sha256',salt).update(value).digest('hex');
}
export function clientAddress(request:Request){
 // Vercel overwrites x-forwarded-for at its trusted edge. Local headers are ignored.
 if(process.env.VERCEL!=='1')return 'local';
 const ip=request.headers.get('x-forwarded-for')?.split(',')[0].trim();
 return ip&&isIP(ip)?ip:'unknown';
}
export async function metric(name:string,amount=1){
 try{const key=`alist:metrics:${new Date().toISOString().slice(0,10)}`;await cache().pipeline().hincrby(key,name,amount).expire(key,172800).exec();}
 catch{console.warn(JSON.stringify({event:'metrics_unavailable'}));}
}
export async function cached<T>(key:string):Promise<T|null>{
 try{return await cache().get<T>(`alist:${key}`);}catch{console.warn(JSON.stringify({event:'cache_read_failed'}));return null;}
}
export async function remember(key:string,value:unknown,seconds:number){
 try{await cache().set(`alist:${key}`,value,{ex:seconds});}catch{console.warn(JSON.stringify({event:'cache_write_failed'}));}
}
const limits=new Map<string,Ratelimit>();
const policies={api:[120,'1 m'],search:[15,'1 m'],loginIp:[8,'15 m'],loginEmail:[3,'15 m'],feed:[30,'5 m'],feedIp:[120,'1 m']} as const;
export async function throttle(kind:keyof typeof policies,identity:string):Promise<Response|null>{
 try{
  let limiter=limits.get(kind);
  if(!limiter){const [count,window]=policies[kind];limiter=new Ratelimit({redis:cache(),limiter:Ratelimit.slidingWindow(count,window),prefix:`alist:limit:${kind}`,analytics:false,timeout:2500,ephemeralCache:new Map()});limits.set(kind,limiter);}
  const result=await limiter.limit(privateKey(identity));await result.pending;
  if(result.reason==='timeout')throw new Error('Rate limit timed out');
  if(result.success)return null;
  await metric('throttled');
  return Response.json({error:'Please wait a moment before trying again.'},{status:429,headers:{'Retry-After':String(Math.max(1,Math.ceil((result.reset-Date.now())/1000))),'Cache-Control':'private, no-store'}});
 }catch{
  console.error(JSON.stringify({event:'rate_limit_unavailable',kind}));
  return Response.json({error:'A-List is temporarily unavailable. Please try again shortly.'},{status:503,headers:{'Retry-After':'30','Cache-Control':'private, no-store'}});
 }
}
export async function withLease<T>(key:string,seconds:number,work:()=>Promise<T>):Promise<T|null>{
 const token=randomUUID();if(!await cache().set(`alist:lock:${key}`,token,{nx:true,ex:seconds}))return null;
 try{return await work();}finally{await cache().eval("if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",[`alist:lock:${key}`],[token]);}
}
