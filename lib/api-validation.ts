import { validMovieId } from './model';
export class InvalidRequest extends Error {}
export function settingsInput(body: Record<string, unknown>): boolean {
  if (typeof body.includeRumors !== 'boolean')
    throw new InvalidRequest('Choose whether to include unconfirmed dates.');
  return body.includeRumors;
}
export function libraryInput(body: Record<string, unknown>) {
  const action = body.action;
  if (!['add', 'remove', 'track', 'watch', 'unwatch'].includes(String(action)))
    throw new InvalidRequest('Unknown library action');
  if (
    !Array.isArray(body.ids) ||
    !body.ids.length ||
    body.ids.length > 100 ||
    body.ids.some((id) => typeof id !== 'string' || !validMovieId(id))
  )
    throw new InvalidRequest('Choose between 1 and 100 valid films.');
  let watchedAt: Record<string, string | null> | undefined;
  if (body.watchedAt !== undefined) {
    if (
      action !== 'add' ||
      !body.watchedAt ||
      typeof body.watchedAt !== 'object' ||
      Array.isArray(body.watchedAt)
    )
      throw new InvalidRequest('Invalid watched-state restoration');
    const entries = Object.entries(body.watchedAt);
    if (
      entries.length > body.ids.length ||
      entries.some(
        ([id, stamp]) =>
          !(body.ids as string[]).includes(id) ||
          (stamp !== null &&
            (typeof stamp !== 'string' ||
              stamp.length > 64 ||
              !/^\d{4}-\d{2}-\d{2}T/.test(stamp) ||
              !Number.isFinite(Date.parse(stamp)))),
      )
    )
      throw new InvalidRequest('Invalid watched-state restoration');
    watchedAt = Object.fromEntries(
      entries.map(([id, stamp]) => [
        id,
        stamp === null ? null : new Date(stamp as string).toISOString(),
      ]),
    );
  }
  return {
    action: action as 'add' | 'remove' | 'track' | 'watch' | 'unwatch',
    ids: [...new Set(body.ids)] as string[],
    ...(watchedAt ? { watchedAt } : {}),
  };
}
