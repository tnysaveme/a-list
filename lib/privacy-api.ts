import 'server-only';
import type { User } from '@supabase/supabase-js';
import type { DataContext } from './data';
import { account } from './data';
import { checked } from './db-result';
import { throttle } from './infrastructure';
import { adminDb } from './supabase/admin';
import { createClient } from './supabase/server';
import { eraseOwnAccount } from './account-privacy';

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function exportLibrary(ctx: DataContext, email: string | undefined) {
  const limited = await throttle('privacy', ctx.userId);
  if (limited) return limited;
  const data = checked(await ctx.db.rpc('a_list_export_library'));
  return Response.json(
    { ...data, account: { email } },
    {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `attachment; filename="a-list-library-${new Date().toISOString().slice(0, 10)}.json"`,
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}
export async function privacyAction(
  ctx: DataContext,
  user: User,
  path: string,
  body: Record<string, unknown>,
) {
  if (path !== 'account/reset-calendar' && path !== 'account/delete') return null;
  if (
    (path === 'account/reset-calendar' && body.confirmation !== 'RESET') ||
    (path === 'account/delete' && body.confirmation !== 'DELETE')
  )
    return json({ error: 'Confirm this action in account settings.' }, 400);
  const limited = await throttle('privacy', user.id);
  if (limited) return limited;
  if (path === 'account/reset-calendar') {
    await account(ctx);
    const token = checked(await ctx.db.rpc('a_list_rotate_calendar')) as string | null;
    if (!token) throw new Error('Calendar reset failed');
    return json({ feedPath: `/api/feed/${token}.ics` });
  }
  const client = await createClient();
  const { data, error } = await client.auth.getSession();
  if (error) return json({ error: 'Sign in again before deleting your account.' }, 401);
  await eraseOwnAccount(user, data.session, adminDb().auth);
  // Global revocation precedes deletion; clear this browser's Supabase session too.
  await client.auth.signOut({ scope: 'local' });
  return json({ deleted: true });
}
