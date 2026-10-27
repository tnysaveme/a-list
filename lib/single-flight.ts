/** Only use for shared, non-personal work. Entries disappear on both success and failure. */
const pending = new Map<string, Promise<unknown>>();
export function singleFlight<T>(key: string, work: () => Promise<T>): Promise<T> {
  const current = pending.get(key);
  if (current) return current as Promise<T>;
  const result = Promise.resolve()
    .then(work)
    .finally(() => {
      if (pending.get(key) === result) pending.delete(key);
    });
  pending.set(key, result);
  return result;
}
