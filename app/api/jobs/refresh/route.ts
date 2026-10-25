import { Receiver } from '@upstash/qstash';
import { refreshSources } from '../../../../lib/ingestion';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  const signature = request.headers.get('upstash-signature');
  if (!signature) return new Response('Unauthorized', { status: 401 });
  if (Number(request.headers.get('content-length') || 0) > 4096)
    return new Response('Too large', { status: 413 });
  const body = await request.text();
  if (body.length > 4096) return new Response('Too large', { status: 413 });
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY,
    next = process.env.QSTASH_NEXT_SIGNING_KEY,
    origin = process.env.ALIST_APP_URL;
  if (!current || !next || !origin) return new Response('Job service unavailable', { status: 503 });
  try {
    await new Receiver({ currentSigningKey: current, nextSigningKey: next }).verify({
      signature,
      body,
      url: `${origin}/api/jobs/refresh`,
      clockTolerance: 5,
    });
  } catch {
    return new Response('Unauthorized', { status: 401 });
  }
  try {
    const result = await refreshSources();
    return Response.json(result || { skipped: 'Another worker is refreshing' }, {
      status: result?.failed ? 503 : 200,
    });
  } catch {
    console.error(JSON.stringify({ event: 'ingestion_failed' }));
    return new Response('Refresh failed', { status: 503 });
  }
}
