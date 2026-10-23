import 'server-only';
import { createClient } from './supabase/server';
export function isAllowedEmail(email?: string | null) {
  const owner = process.env.ALIST_ALLOWED_EMAIL?.trim().toLowerCase();
  return !!owner && email?.trim().toLowerCase() === owner;
}
export async function getUser() {
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  return !error && data.user && isAllowedEmail(data.user.email) ? data.user : null;
}
