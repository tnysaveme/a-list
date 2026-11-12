import { adminDb } from '../../../lib/supabase/admin';
import { checked } from '../../../lib/db-result';
import { sourceHealthSummary, SOURCE_HEALTH_COLUMNS } from '../../../lib/source-health';
import { throttle, clientAddress } from '../../../lib/infrastructure';
export const dynamic = 'force-dynamic';
/** Public readiness contains no diagnostics, identity, library data or feed tokens. */
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  const blocked = await throttle('feedIp', clientAddress(request));
  if (blocked) return blocked;
  try {
    const status = checked(
      await adminDb()
        .from('a_list_source_status')
        .select(SOURCE_HEALTH_COLUMNS)
        .eq('id', true)
        .abortSignal(AbortSignal.timeout(3000))
        .single(),
    );
    const healthy = sourceHealthSummary(status || {}).status === 'healthy';
    return Response.json(
      { status: healthy ? 'healthy' : 'degraded' },
      { status: healthy ? 200 : 503, headers },
    );
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503, headers });
  }
}
