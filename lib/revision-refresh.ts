/** Acknowledge the revision read before loading; failures and concurrent edits stay retryable. */
export function revisionRefresh(read: () => Promise<string>, refresh: () => Promise<boolean>) {
  let applied: string | null = null;
  return async () => {
    const revision = await read();
    if (!/^[a-f0-9]{32}$/.test(revision)) throw new Error('Invalid collection revision');
    if (revision === applied) return;
    if (!(await refresh())) throw new Error('Refresh did not complete');
    applied = revision;
  };
}
