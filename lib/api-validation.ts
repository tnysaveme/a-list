import { validMovieId } from './model';
export class InvalidRequest extends Error {}
export function settingsInput(body: Record<string, unknown>): boolean {
  if (typeof body.includeRumors !== 'boolean')
    throw new InvalidRequest('Choose whether to include unconfirmed dates.');
  return body.includeRumors;
}
export function libraryInput(body: Record<string, unknown>) {
  const action = body.action;
  if (action !== 'add' && action !== 'remove' && action !== 'track')
    throw new InvalidRequest('Unknown library action');
  if (
    !Array.isArray(body.ids) ||
    !body.ids.length ||
    body.ids.length > 100 ||
    body.ids.some((id) => typeof id !== 'string' || !validMovieId(id))
  )
    throw new InvalidRequest('Choose between 1 and 100 valid films.');
  return { action, ids: [...new Set(body.ids)] as string[] };
}
