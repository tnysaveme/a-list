import { getUser } from '../../../lib/auth';
import { adminDb } from '../../../lib/supabase/admin';
import { cache, throttle } from '../../../lib/infrastructure';
import { sourceReadiness } from '../../../lib/source-readiness';
import { checked } from '../../../lib/db-result';
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
  const status = await sourceReadiness(db, AbortSignal.timeout(3000));
  const backlog = await db.rpc('a_list_refresh_candidates', { p_limit: 8 });
  checked(backlog);
  const queues = status.queues;
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
      queues,
      metrics,
      limits: { authEmailsPerHour: 30 },
      checkedAt: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
