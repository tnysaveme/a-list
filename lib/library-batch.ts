export type LibraryAction = 'add' | 'remove';
export type Membership = Record<string, boolean>;
export type BatchResult = {
  requestedIds: string[];
  changedIds: string[];
  completedIds: string[];
  remainingIds: string[];
  membership: Membership;
  reconciled: boolean;
  error?: string;
};
type BatchIO = {
  read: (ids: string[]) => Promise<Membership>;
  write: (action: LibraryAction, ids: string[]) => Promise<void>;
};

/** Re-read server state even after a lost response: an HTTP error is not proof
 * that a write was rolled back. Only confirmed changes are offered for Undo. */
export async function applyLibraryBatch(
  action: LibraryAction,
  input: string[],
  io: BatchIO,
): Promise<BatchResult> {
  const requestedIds = [...new Set(input)],
    target = action === 'add',
    before: Membership = {},
    after: Membership = {};
  const empty = (error: string): BatchResult => ({
    requestedIds,
    changedIds: [],
    completedIds: [],
    remainingIds: requestedIds,
    membership: {},
    reconciled: false,
    error,
  });
  try {
    for (let i = 0; i < requestedIds.length; i += 100)
      Object.assign(before, await io.read(requestedIds.slice(i, i + 100)));
    if (requestedIds.some((id) => typeof before[id] !== 'boolean'))
      throw new Error('Incomplete membership response');
  } catch {
    return empty('Your library could not be checked. No changes were requested. Please try again.');
  }
  const pending = requestedIds.filter((id) => before[id] !== target),
    acknowledged: string[] = [];
  let error: string | undefined;
  for (let i = 0; i < pending.length; i += 100) {
    const ids = pending.slice(i, i + 100);
    try {
      await io.write(action, ids);
      acknowledged.push(...ids);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Some library changes could not be completed.';
      break;
    }
  }
  let reconciled = true;
  try {
    for (let i = 0; i < requestedIds.length; i += 100)
      Object.assign(after, await io.read(requestedIds.slice(i, i + 100)));
    if (requestedIds.some((id) => typeof after[id] !== 'boolean'))
      throw new Error('Incomplete membership response');
  } catch {
    reconciled = false;
    // Discard an incomplete read so a lost response cannot produce a false result.
    for (const key of Object.keys(after)) delete after[key];
    for (const id of acknowledged) after[id] = target;
    error =
      'Some changes could not be confirmed. Your library will refresh; retry only the remaining films.';
  }
  const completedIds = requestedIds.filter((id) => after[id] === target),
    remainingIds = requestedIds.filter((id) => after[id] !== target);
  const changedIds = completedIds.filter((id) => before[id] !== target);
  return {
    requestedIds,
    changedIds,
    completedIds,
    remainingIds,
    membership: after,
    reconciled,
    ...(remainingIds.length || !reconciled ? { error } : {}),
  };
}
