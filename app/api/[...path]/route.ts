import type { PostResponses, MovieResponse } from '../../../lib/api-contract';
import { ConfigurationError } from '../../../lib/configuration';
import { getUser } from '../../../lib/auth';
import {
  account,
  context,
  getCatalogue,
  getLibraryPage,
  getMovie,
  searchMovies,
  updateLibrary,
  updateSettings,
  getCalendarFeed,
} from '../../../lib/data';
import { pageOptions } from '../../../lib/pagination';
import { feedResponse } from '../../../lib/feed-cache';
import { throttle, clientAddress, metric } from '../../../lib/infrastructure';
import { sameOrigin } from '../../../lib/request-origin';
import { after } from 'next/server';
import { InvalidRequest, settingsInput, libraryInput } from '../../../lib/api-validation';
import { validMovieId } from '../../../lib/model';
import { exportLibrary, privacyAction } from '../../../lib/privacy-api';
import { MovieOnlyError, readLibraryMembership } from '../../../lib/library-mutations';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function handle(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\//, '');
  try {
    if (request.method === 'GET' && /^feed\/[a-f0-9-]{68}\.ics$/.test(path)) {
      const checks = await Promise.all([
        throttle('feedIp', clientAddress(request)),
        throttle('feed', path),
      ]);
      const blocked = checks.find(Boolean);
      if (blocked) return blocked;
      const feed = await getCalendarFeed(path.slice(5, -4));
      if (!feed) return new Response('Calendar not found', { status: 404 });
      return feedResponse(request, feed);
    }
    const user = await getUser();
    if (!user) return json({ error: 'Sign in to open your personal library.' }, 401);
    const blocked = await throttle('api', user.id);
    if (blocked) return blocked;
    const ctx = await context(user.id);
    after(() => metric('api_requests'));
    if (request.method === 'GET' && path === 'account/export')
      return exportLibrary(ctx, user.email);
    if (request.method === 'GET' && path === 'library/membership') {
      const ids = [...new Set((url.searchParams.get('ids') || '').split(','))];
      if (ids.length > 100 || ids.some((id) => !validMovieId(id)))
        return json({ error: 'Choose up to 100 valid films.' }, 400);
      return json({ membership: await readLibraryMembership(ctx.db, ctx.userId, ids) });
    }
    if (request.method === 'GET' && path === 'catalogue') {
      let options;
      try {
        options = pageOptions(url);
      } catch {
        return json({ error: 'Invalid catalogue page' }, 400);
      }
      if (options.sort === 'added') return json({ error: 'Invalid catalogue sort' }, 400);
      return json(await getCatalogue(ctx, options));
    }
    if (request.method === 'GET' && path === 'library') {
      let options;
      try {
        options = pageOptions(url);
      } catch {
        return json({ error: 'Invalid library page' }, 400);
      }
      return json(await getLibraryPage(ctx, options));
    }
    if (request.method === 'GET' && path === 'search') {
      const limited = await throttle('search', user.id);
      if (limited) return limited;
      const query = (url.searchParams.get('q') || '').trim().slice(0, 50);
      return json({ movies: query.length < 2 ? [] : await searchMovies(ctx, query) });
    }
    if (request.method === 'GET' && path.startsWith('movie/') && validMovieId(path.slice(6))) {
      const movie = await getMovie(ctx, path.slice(6), url.searchParams.get('cached') === 'true');
      return movie
        ? json({ movie } satisfies MovieResponse)
        : json({ error: 'This film could not be found.' }, 404);
    }
    if (request.method !== 'POST') return json({ error: 'Not found' }, 404);
    if (!sameOrigin(request))
      return json({ error: 'This request must come from your library.' }, 403);
    if (Number(request.headers.get('content-length') || 0) > 10000)
      return json({ error: 'Request too large' }, 413);
    const raw = await request.text();
    if (raw.length > 10000) return json({ error: 'Request too large' }, 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: 'Invalid request' }, 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return json({ error: 'Invalid request' }, 400);
    const privacy = await privacyAction(ctx, user, path, body);
    if (privacy) return privacy;
    if (path === 'init') {
      const owner = await account(ctx);
      const page = await getLibraryPage(ctx);
      const response: PostResponses['init'] = {
        ...page,
        feedPath: `/api/feed/${owner.feed_token}.ics`,
        includeRumors: owner.include_rumors,
        feedPublic: true,
      };
      return json(response);
    }
    if (path === 'settings') {
      await updateSettings(ctx, settingsInput(body));
      return json({ ok: true });
    }
    if (path !== 'library') return json({ error: 'Not found' }, 404);
    if (body.action === 'untrack')
      return json(
        {
          error:
            'Calendar dates follow your library. Remove a film from your library to remove its events.',
        },
        409,
      );
    const input = libraryInput(body);
    await updateLibrary(ctx, input.action, input.ids);
    return json({ ok: true });
  } catch (error) {
    if (error instanceof ConfigurationError) {
      console.error(JSON.stringify({ event: 'configuration_missing', keys: error.missing }));
      return json({ error: 'A-List needs configuration. Please check the server setup.' }, 503);
    }
    if (error instanceof InvalidRequest) return json({ error: error.message }, 400);
    if (error instanceof MovieOnlyError) return json({ error: error.message }, 400);
    console.error('A-List request:', error instanceof Error ? error.message : 'Request failed');
    return json(
      {
        error:
          'A-List could not refresh this request. Your saved films are safe. Please try again.',
      },
      503,
    );
  }
}
async function observed(request: Request) {
  const started = performance.now();
  const response = await handle(request);
  console.log(
    JSON.stringify({
      event: 'api_request',
      family: new URL(request.url).pathname.split('/')[2],
      status: response.status,
      durationMs: Math.round(performance.now() - started),
    }),
  );
  return response;
}
export const GET = observed;
export const POST = observed;
