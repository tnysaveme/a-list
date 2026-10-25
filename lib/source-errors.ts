import type { Movie, SourceIssue } from './model';

export function sourceIssue(error: unknown, provider: SourceIssue['provider']): SourceIssue {
  const value = error instanceof Error ? error : new Error('Source unavailable');
  if (
    value.name === 'AbortError' ||
    value.name === 'TimeoutError' ||
    /timed? ?out|deadline/i.test(value.message)
  )
    return { provider, category: 'timeout' };
  const status = value.message.match(/(?:returned|HTTP|status)\s*[:=]?\s*(\d{3})/i)?.[1];
  if (status) return { provider, category: 'http_error', status: Number(status) };
  if (/metadata not listed/i.test(value.message)) return { provider, category: 'not_listed' };
  if (/identity|conflict|subject not verified/i.test(value.message))
    return { provider, category: 'identity_conflict' };
  if (
    value instanceof SyntaxError ||
    /format|parse|unexpected|response too large|metadata.*mismatch/i.test(value.message)
  )
    return { provider, category: 'format_changed' };
  return { provider, category: 'unavailable' };
}

export class MovieRefreshError extends Error {
  constructor(
    readonly movie: Movie,
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : 'Release refresh failed', { cause });
    this.name = 'MovieRefreshError';
  }
}

export function failedRefreshMovie(movie: Movie, error: unknown): Movie {
  return error instanceof MovieRefreshError
    ? error.movie
    : {
        ...movie,
        releaseCheck: {
          status: 'failed',
          attemptedAt: new Date().toISOString(),
          issues: [sourceIssue(error, 'primary')],
        },
      };
}

/** Log only public film identity and structured categories, never private URLs or tokens. */
export function logSourceIssue(movieId: string, issue: SourceIssue) {
  console.warn(JSON.stringify({ event: 'film_source_failed', movieId, ...issue }));
}
