import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { sameOrigin } from '../../../lib/request-origin';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Invalid origin.' }, { status: 403 });
  const origin = request.headers.get('origin')!;
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', origin), { status: 303 });
}
