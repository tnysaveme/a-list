import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
export async function POST(request:Request) {
  const origin=new URL(request.url).origin;
  if(request.headers.get('origin')!==origin)return Response.json({error:'Invalid origin.'},{status:403});
  const supabase=await createClient();await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login',origin),{status:303});
}
