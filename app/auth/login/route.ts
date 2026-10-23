import { createClient } from '../../../lib/supabase/server';
import { isAllowedEmail } from '../../../lib/auth';
export async function POST(request:Request) {
  const origin=new URL(request.url).origin;
  if(request.headers.get('origin')!==origin)return Response.json({error:'Open sign-in from A-List.'},{status:403});
  const raw=await request.text();if(raw.length>2000)return Response.json({error:'Invalid request.'},{status:400});
  let email;try{email=JSON.parse(raw).email;}catch{return Response.json({error:'Enter your email address.'},{status:400});}
  if(typeof email!=='string'||email.length>254||!isAllowedEmail(email))return Response.json({error:'This is a personal library. Use its owner’s email address.'},{status:403});
  const supabase=await createClient();
  const {error}=await supabase.auth.signInWithOtp({email:email.trim().toLowerCase(),options:{emailRedirectTo:`${origin}/auth/callback`,shouldCreateUser:true}});
  if(error)return Response.json({error:'The sign-in link could not be sent. Please try again shortly.'},{status:429});
  return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
}
