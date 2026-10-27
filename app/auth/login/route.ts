import { createClient } from '../../../lib/supabase/server';
import { isAllowedEmail } from '../../../lib/auth';
import { throttle, clientAddress, metric } from '../../../lib/infrastructure';
import { sameOrigin } from '../../../lib/request-origin';
import { after } from 'next/server';
async function login(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: 'Open sign-in from A-List.' }, { status: 403 });
  const origin = request.headers.get('origin')!;
  const raw = await request.text();
  if (raw.length > 2000) return Response.json({ error: 'Invalid request.' }, { status: 400 });
  let email;
  try {
    email = JSON.parse(raw).email;
  } catch {
    return Response.json({ error: 'Enter your email address.' }, { status: 400 });
  }
  if (typeof email !== 'string' || email.length > 254 || !isAllowedEmail(email))
    return Response.json(
      { error: 'Sign-in is not available for this email address.' },
      { status: 403 },
    );
  const blocked =
    (await throttle('loginIp', clientAddress(request))) ||
    (await throttle('loginEmail', email.trim().toLowerCase()));
  if (blocked) return blocked;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: `${origin}/auth/callback`, shouldCreateUser: true },
  });
  if (error)
    return Response.json(
      { error: 'The sign-in link could not be sent. Please try again shortly.' },
      { status: 429 },
    );
  after(() => metric('sign_in_emails'));
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  try {
    return await login(request);
  } catch {
    console.error(JSON.stringify({ event: 'sign_in_service_unavailable' }));
    return Response.json(
      { error: 'Sign-in is temporarily unavailable. Please try again shortly.' },
      { status: 503, headers: { 'Retry-After': '30', 'Cache-Control': 'private, no-store' } },
    );
  }
}
