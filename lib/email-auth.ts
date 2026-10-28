/** Email tokens are bearer credentials. Validate shape without logging or displaying them. */
export function validEmailToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32,256}$/.test(value);
}
export function emailAuthFailure(error: { status?: number; code?: string } | null) {
  if (!error) return null;
  return error.status === 429
    ? 'rate-limit'
    : !error.status || error.status >= 500
      ? 'service-unavailable'
      : 'expired-link';
}
