import { getUser } from '../../../lib/auth';
import { adminDb } from '../../../lib/supabase/admin';
import { cache, throttle } from '../../../lib/infrastructure';
import { checked } from '../../../lib/data';
import { sourceHealthSummary } from '../../../lib/source-health';
export const dynamic = 'force-dynamic';
export async function GET() {
  const user = await getUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401 });
  const owners = [process.env.ALIST_ALLOWED_EMAIL || '']
    .flatMap((s) => s.split(','))
    .map((s) => s.trim().toLowerCase());
  if (!user.email || !owners.includes(user.email.toLowerCase()))
    return Response.json({ error: 'Not found' }, { status: 404 });
  const limited = await throttle('api', user.id);
  if (limited) return limited;
  const db = adminDb();
  const status = checked(
    await db
      .from('a_list_source_status')
      .select(
        'catalogue_success_at,last_attempt_at,last_success_at,last_failure_at,failures,source_health',
      )
      .eq('id', true)
      .single(),
  )!;
  const backlog = await db.rpc('a_list_refresh_candidates', { p_limit: 8 });
  checked(backlog);
  const metrics = await cache().hgetall(`alist:metrics:${new Date().toISOString().slice(0, 10)}`);
  const health = sourceHealthSummary(status);
  const failed =
    checked(
      await db
        .from('a_list_movies')
        .select('id,movie,refresh_failures,refresh_after')
        .gt('refresh_failures', 0)
        .order('refresh_after')
        .limit(20),
    ) || [];
  const recentFailures = failed.map((row) => ({
    id: row.id,
    title: row.movie.title,
    failures: row.refresh_failures,
    retryAt: row.refresh_after,
    check: row.movie.releaseCheck || null,
  }));
  return Response.json(
    {
      ...health,
      sources: status,
      dueBatch: backlog.data.length,
      recentFailures,
      metrics,
      limits: { authEmailsPerHour: 30 },
      checkedAt: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
