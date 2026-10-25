/** Drain due work without exceeding a request's concurrency, item or time budget. */
export async function drainDue<T>(
  load: () => Promise<T[]>,
  work: (item: T) => Promise<void>,
  options: {
    started: number;
    clock?: () => number;
    budgetMs?: number;
    maxItems?: number;
    concurrency?: number;
  },
) {
  const { started, clock = Date.now, budgetMs = 36_000, maxItems = 64, concurrency = 4 } = options;
  let processed = 0;
  while (processed < maxItems && clock() - started < budgetMs) {
    const batch = await load();
    if (!batch.length) break;
    for (
      let i = 0;
      i < batch.length && processed < maxItems && clock() - started < budgetMs;
      i += concurrency
    ) {
      const items = batch.slice(i, i + Math.min(concurrency, maxItems - processed));
      const outcomes = await Promise.allSettled(items.map(work));
      processed += items.length;
      // Let every in-flight write settle before the caller releases its lease.
      if (outcomes.some((r) => r.status === 'rejected'))
        throw new Error('A background batch could not be saved');
    }
  }
  return processed;
}
