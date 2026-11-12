import { applyLibraryBatch } from './library-batch';

export type WatchedState = Record<string, string | null>;

/** A lost response is reconciled with account state before claiming a change. */
export async function applyWatchedBatch(
  watched: boolean,
  ids: string[],
  io: {
    read: (
      ids: string[],
    ) => Promise<{ membership: Record<string, boolean>; watched: WatchedState }>;
    write: (
      watched: boolean,
      ids: string[],
    ) => Promise<{ watched: WatchedState; membership: Record<string, boolean> }>;
  },
) {
  const timestamps: WatchedState = {};
  const saved: Record<string, boolean> = {};
  const result = await applyLibraryBatch(watched ? 'add' : 'remove', ids, {
    read: async (chunk) => {
      const state = await io.read(chunk);
      if (
        chunk.some(
          (id) => !Object.hasOwn(state.watched, id) || typeof state.membership[id] !== 'boolean',
        )
      )
        throw new Error('Incomplete watched state');
      Object.assign(timestamps, state.watched);
      Object.assign(saved, state.membership);
      if (chunk.some((id) => !state.membership[id])) throw new Error('Film is no longer saved');
      return Object.fromEntries(
        chunk.map((id) => [id, state.membership[id] && !!state.watched[id]]),
      );
    },
    write: async (_action, chunk) => {
      const state = await io.write(watched, chunk);
      if (
        chunk.some(
          (id) => !Object.hasOwn(state.watched, id) || typeof state.membership[id] !== 'boolean',
        )
      )
        throw new Error('Watched state was not returned');
      Object.assign(timestamps, state.watched);
      Object.assign(saved, state.membership);
    },
  });
  const completedIds = result.completedIds.filter(
    (id) => saved[id] && !!timestamps[id] === watched,
  );
  const remainingIds = result.requestedIds.filter((id) => !completedIds.includes(id));
  return {
    ...result,
    completedIds,
    changedIds: result.changedIds.filter((id) => completedIds.includes(id)),
    remainingIds,
    ...(remainingIds.length
      ? { error: result.error || 'The film is no longer saved in your library.' }
      : {}),
    watched: Object.fromEntries(
      completedIds.map((id) => [id, timestamps[id] || null]),
    ) as WatchedState,
  };
}
