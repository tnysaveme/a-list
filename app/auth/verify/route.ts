import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { isAllowedEmail } from '../../../lib/auth';
import { sameOrigin } from '../../../lib/request-origin';
import { clientAddress, throttle } from '../../../lib/infrastructure';
import { emailAuthFailure, validEmailToken } from '../../../lib/email-auth';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Open this link from A-List.', { status: 403 });
  const origin = request.headers.get('origin')!;
  const result = (path: string) => {
    const response = NextResponse.redirect(new URL(path, origin), 303);
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  };
  try {
    if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))
      return result('/login?error=expired-link');
    const raw = await request.text();
    if (raw.length > 2000) return result('/login?error=expired-link');
    const tokenHash = new URLSearchParams(raw).get('token_hash');
    if (!validEmailToken(tokenHash)) return result('/login?error=expired-link');
    const blocked = await throttle('verifyIp', clientAddress(request));
    if (blocked)
      return result(
        `/login?error=${blocked.status === 429 ? 'rate-limit' : 'service-unavailable'}`,
      );
    const client = await createClient();
    const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
    const failure = emailAuthFailure(error);
    if (failure) return result(`/login?error=${failure}`);
    if (!data.session || !data.user || !isAllowedEmail(data.user.email)) {
      await client.auth.signOut({ scope: 'local' });
      return result('/login?error=expired-link');
    }
    return result('/');
  } catch {
    console.error(JSON.stringify({ event: 'email_confirmation_unavailable' }));
    return result('/login?error=service-unavailable');
  }
}
