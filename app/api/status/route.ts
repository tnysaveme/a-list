import { adminDb } from '../../../lib/supabase/admin';
import { sourceReadiness } from '../../../lib/source-readiness';
import { sourceHealthSummary } from '../../../lib/source-health';
import { throttle, clientAddress } from '../../../lib/infrastructure';
export const dynamic = 'force-dynamic';
/** Public readiness contains no diagnostics, identity, library data or feed tokens. */
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  const blocked = await throttle('feedIp', clientAddress(request));
  if (blocked) return blocked;
  try {
    const status = await sourceReadiness(adminDb(), AbortSignal.timeout(3000));
    const healthy = sourceHealthSummary(status || {}).status === 'healthy';
    return Response.json(
      { status: healthy ? 'healthy' : 'degraded' },
      { status: healthy ? 200 : 503, headers },
    );
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503, headers });
  }
}
