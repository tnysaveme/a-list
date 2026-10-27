/** Bound the interactive wait without cancelling work already committing verified results. */
export async function interactiveResult<T>(
  work: Promise<T>,
  budgetMs: number,
): Promise<{ ready: true; value: T } | { ready: false }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work.then((value) => ({ ready: true as const, value })),
      new Promise<{ ready: false }>((resolve) => {
        timer = setTimeout(() => resolve({ ready: false }), budgetMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
