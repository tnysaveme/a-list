import { createServer } from 'node:http';
import { discoverMovies } from '../../lib/catalogue-view';
import { calendarRelease, calendarReleases, type Movie } from '../../lib/model';
const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'fixture@example.invalid',
  aud: 'authenticated',
  role: 'authenticated',
  email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider: 'email' },
  user_metadata: {},
};
const initialToken = '11111111-1111-4111-8111-111111111111' + 'a'.repeat(32);
const films: Movie[] = Array.from({ length: 32 }, (_, i) => ({
  id: String(i + 1),
  title: `Fixture Film ${String(i).padStart(2, '0')}`,
  year: '2026',
  source: `https://www.dvdsreleasedates.com/movies/${i + 1}/fixture`,
  poster: '',
  overview: 'A deterministic fixture synopsis.',
  synopsisCheckedAt: new Date().toISOString(),
  checkedAt: new Date().toISOString(),
  releaseCheckedAt: new Date().toISOString(),
  releases: [
    {
      kind: 'Digital',
      date: '2099-11-01',
      confidence: i === 0 ? 'rumored' : 'listed',
      source: 'https://example.invalid/fixture',
      sourceName: 'Fixture',
    },
  ],
}));
const initialFilms = JSON.parse(JSON.stringify(films)) as Movie[];
const refreshAfter = new Map<string, string>();
let saved = new Set<string>(),
  includeRumors = true,
  feedToken = initialToken,
  deleted = false,
  flags: Record<string, unknown> = {};
const redis = new Map<string, string>();
const usedEmailTokens = new Set<string>();
let emailVerifications = 0;
function reset() {
  films.splice(0, films.length, ...JSON.parse(JSON.stringify(initialFilms)));
  saved = new Set(films.slice(0, 27).map((m) => m.id));
  includeRumors = true;
  feedToken = initialToken;
  deleted = false;
  flags = {};
  usedEmailTokens.clear();
  emailVerifications = 0;
  redis.clear();
  refreshAfter.clear();
  for (const m of films) {
    m.releaseCheckedAt = new Date().toISOString();
    refreshAfter.set(m.id, '2099-01-01T00:00:00Z');
  }
}
reset();
const membership = (m: Movie) => ({
  ...m,
  saved: saved.has(m.id),
  tracked: saved.has(m.id),
  addedAt: '2026-10-26T00:00:00Z',
});
const account = () => ({ id: user.id, feed_token: feedToken, include_rumors: includeRumors });
function page(args: Record<string, unknown>) {
  const all = films.filter((m) => saved.has(m.id)).map(membership),
    sort = String(args.p_sort || 'release'),
    filter = String(args.p_filter || 'all'),
    offset = Number(args.p_offset || 0),
    limit = Number(args.p_limit || 25),
    filtered = discoverMovies(all, filter, sort, '2026-10-26');
  const upcoming = all
    .map((movie) => ({ movie, release: calendarRelease(movie, includeRumors, '2026-10-26') }))
    .filter((v) => v.release)
    .sort((a, b) => a.release!.date.localeCompare(b.release!.date))[0];
  return {
    movies: filtered.slice(offset, offset + limit),
    total: all.length,
    filteredTotal: filtered.length,
    trackedCount: all.length,
    knownCount: all.length,
    listedEvents: all.flatMap((m) => calendarReleases(m, false)).length,
    rumoredEvents: all.flatMap((m) => m.releases.filter((r) => r.confidence === 'rumored')).length,
    upcoming: upcoming?.movie || null,
    upcomingRelease: upcoming?.release || null,
  };
}
function execute(command: unknown[]) {
  const [op, key, value] = command as string[];
  switch (op.toLowerCase()) {
    case 'get':
      return redis.get(key) || null;
    case 'set':
      if (command.includes('nx') && redis.has(key)) return null;
      redis.set(key, typeof value === 'string' ? value : JSON.stringify(value));
      return 'OK';
    case 'del':
      for (const k of command.slice(1)) redis.delete(String(k));
      return 1;
    case 'eval':
    case 'evalsha':
      if (Number(command[2]) === 2) return [100, 120];
      redis.delete(String(command[3]));
      return 1;
    case 'hincrby':
      return 1;
    case 'expire':
      return 1;
    case 'hgetall':
      return [];
    default:
      throw Error(`Unexpected Redis fixture command ${op}`);
  }
}
export const server = createServer(async (req, res) => {
  const url = new URL(req.url!, 'http://127.0.0.1:4318');
  let body: unknown = {};
  let raw = '';
  for await (const c of req) raw += c;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {}
  const json = (value: unknown, status = 200) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(value));
  };
  if (url.pathname === '/_control') {
    if ((body as { reset?: boolean }).reset) reset();
    else {
      flags = { ...flags, ...(body as object) };
      redis.clear();
      for (const id of (flags.staleMovies || []) as string[]) {
        const film = films.find((m) => m.id === id);
        if (film) {
          film.releaseCheckedAt = '2000-01-01T00:00:00Z';
          refreshAfter.set(id, '2000-01-01T00:00:00Z');
        }
      }
    }
    return json({ ok: true });
  }
  if (url.pathname === '/_auth-observation') return json({ emailVerifications });
  if (url.pathname.startsWith('/redis')) {
    if (flags.redisUnavailable) return json({ error: 'fixture unavailable' }, 503);
    try {
      return json(
        url.pathname.endsWith('/pipeline')
          ? (body as unknown[][]).map((cmd) => ({ result: execute(cmd) }))
          : { result: execute(body as unknown[]) },
      );
    } catch (error) {
      return json({ error: String(error) }, 400);
    }
  }
  if (url.pathname === '/source') {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    if (flags.sourceSuccess) {
      const source = url.searchParams.get('url')!;
      const id = new URL(source).pathname.split('/')[2];
      const movie = films.find((m) => m.id === id)!;
      res.end(
        `<link rel="canonical" href="${source}"><h1>${movie.title} (${movie.year})</h1><h2>Digital HD release date November 2, 2099</h2><!--${'.'.repeat(600)}-->`,
      );
    } else {
      res.statusCode = 503;
      res.end('Temporary source outage');
    }
    return;
  }
  if (url.pathname.startsWith('/auth/')) {
    if (flags.authUnavailable)
      return json({ message: 'Unavailable', code: 'unexpected_failure' }, 503);
    if (req.method === 'DELETE') {
      deleted = true;
      saved.clear();
      return json({});
    }
    if (url.pathname.endsWith('/logout')) return json({});
    if (flags.authExpired || deleted)
      return json({ message: 'Session expired', code: 'session_not_found' }, 401);
    if (url.pathname.endsWith('/verify')) {
      emailVerifications++;
      const args = body as { token_hash?: string; type?: string };
      const token = args.token_hash || '';
      if (token !== 'a'.repeat(64) || usedEmailTokens.has(token) || args.type !== 'email')
        return json({ message: 'Expired token', code: 'otp_expired' }, 403);
      usedEmailTokens.add(token);
      const en = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const accessToken = `${en({ alg: 'HS256', typ: 'JWT' })}.${en({ sub: user.id, aud: 'authenticated', exp: 4102444800, iat: 1792972800, role: 'authenticated' })}.fixture-signature`;
      return json({
        access_token: accessToken,
        refresh_token: 'fixture-refresh',
        expires_in: 3600,
        expires_at: 4102444800,
        token_type: 'bearer',
        user,
      });
    }
    if (url.pathname.endsWith('/user')) return json(user);
    return json({});
  }
  if (!url.pathname.startsWith('/rest/v1/')) return json({ error: 'Unknown fixture path' }, 404);
  if (flags.databaseUnavailable) return json({ message: 'Fixture database unavailable' }, 503);
  const args = body as Record<string, unknown>,
    name = url.pathname.split('/').at(-1)!;
  if (name === 'a_list_library_page') {
    if (args.p_filter === 'available') await new Promise((resolve) => setTimeout(resolve, 200));
    return json(page(args));
  }
  if (name === 'a_list_calendar_state')
    return json(
      !deleted && args.p_token === feedToken
        ? {
            revision: String(saved.size) + String(includeRumors),
            sourcesVersion: 'fixture',
            modifiedAt: new Date().toISOString(),
            includeRumors,
          }
        : null,
    );
  if (name === 'a_list_calendar_feed')
    return json(
      !deleted && args.p_token === feedToken
        ? { movies: films.filter((m) => saved.has(m.id)), includeRumors }
        : null,
    );
  if (name === 'a_list_export_library')
    return json({
      schemaVersion: 1,
      library: films.filter((m) => saved.has(m.id)),
      settings: { includeReportedDates: includeRumors },
    });
  if (name === 'a_list_rotate_calendar') {
    feedToken = '22222222-2222-4222-8222-222222222222' + 'b'.repeat(32);
    return json(feedToken);
  }
  if (name === 'a_list_source_status' && flags.catalogueUnavailable)
    return json({ message: 'Catalogue fixture outage' }, 503);
  if (name === 'a_list_source_status')
    return json({
      catalogue: films,
      catalogue_success_at: new Date().toISOString(),
      last_success_at: new Date().toISOString(),
      failures: 0,
      source_health: {
        wts_feed: { lastSuccess: new Date().toISOString(), ok: true },
        catalogue: { lastSuccess: new Date().toISOString(), ok: true },
      },
    });
  const ids = (url.searchParams.get('id') || url.searchParams.get('movie_id') || '')
    .replace(/^in\.\(|\)$/g, '')
    .split(',');
  const id = url.searchParams.get('id')?.replace(/^eq\./, '');
  if (name === 'a_list_movies') {
    if (req.method === 'PATCH' && id) {
      const film = films.find((m) => m.id === id);
      if (film && args.movie) Object.assign(film, args.movie);
      if (typeof args.refresh_after === 'string') refreshAfter.set(id, args.refresh_after);
    }
    const selected = films
      .filter((m) => id === m.id || ids.includes(m.id))
      .map((movie) => ({
        id: movie.id,
        movie,
        refresh_after: refreshAfter.get(movie.id),
        updated_at: '2026-10-26T00:00:00Z',
      }));
    return json(req.headers.accept?.includes('vnd.pgrst.object') ? selected[0] || null : selected);
  }
  if (name === 'a_list_accounts') {
    if (req.method === 'PATCH' && typeof args.include_rumors === 'boolean')
      includeRumors = args.include_rumors;
    return json(req.method === 'GET' ? account() : null);
  }
  if (name === 'a_list_library') {
    if (req.method === 'POST')
      for (const row of body as { movie_id: string }[]) saved.add(row.movie_id);
    if (req.method === 'DELETE') for (const item of ids) saved.delete(item);
    return json(
      req.method === 'GET'
        ? films
            .filter((m) => saved.has(m.id) && ids.includes(m.id))
            .map((m) => ({ movie_id: m.id, tracked: true, added_at: '2026-10-26T00:00:00Z' }))
        : null,
    );
  }
  return json({ message: 'Unknown fixture operation ' + name }, 400);
});
server.listen(4318, '127.0.0.1');
process.on('SIGTERM', () => server.close());
