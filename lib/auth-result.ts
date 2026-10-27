/** Provider outages must not be treated as signed-out sessions. */
export function checkAuthError(error: { status?: number; name?: string; code?: string } | null) {
  if (!error) return;
  if (
    error.name === 'AuthSessionMissingError' ||
    error.status === 401 ||
    error.status === 403 ||
    [
      'session_not_found',
      'refresh_token_not_found',
      'refresh_token_already_used',
      'bad_jwt',
    ].includes(error.code || '')
  )
    return;
  throw new Error('Sign-in service temporarily unavailable');
}
