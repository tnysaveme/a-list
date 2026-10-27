import 'server-only';
import { checkAuthError } from './auth-result';
import { createClient } from './supabase/server';
import { emailIsAllowed } from './access';
export function isAllowedEmail(email?: string | null) {
  return emailIsAllowed(
    email,
    [process.env.ALIST_ALLOWED_EMAIL, process.env.ALIST_ALLOWED_EMAILS],
    process.env.ALIST_ALLOW_SIGNUPS === 'true',
  );
}
export async function getUser() {
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  checkAuthError(error);
  return !error && data.user && isAllowedEmail(data.user.email) ? data.user : null;
}
