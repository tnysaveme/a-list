/** Releasing a lease is best-effort: it must never replace a committed result or work error. */
export async function runWithLease<T>(
  store: {
    acquire: (token: string) => Promise<boolean>;
    release: (token: string) => Promise<unknown>;
  },
  token: string,
  work: () => Promise<T>,
  onCleanupFailure: () => void,
): Promise<T | null> {
  if (!(await store.acquire(token))) return null;
  try {
    return await work();
  } finally {
    try {
      await store.release(token);
    } catch {
      onCleanupFailure();
    }
  }
}
