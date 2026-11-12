import { setTimeout as delay } from 'node:timers/promises';
import { singleFlight } from './single-flight';

/** Share only provider results; attach personal library membership after this returns. */
export function sharedSearch<T>(
  key: string,
  {
    read,
    lease,
    load,
    now = Date.now,
    sleep = delay,
    waitMs = 3000,
  }: {
    read: () => Promise<T | null>;
    lease: (work: () => Promise<T>) => Promise<T | null>;
    load: () => Promise<T>;
    now?: () => number;
    sleep?: (ms: number) => Promise<unknown>;
    waitMs?: number;
  },
): Promise<T> {
  return singleFlight(`search:${key}`, async () => {
    const hit = await read();
    if (hit !== null) return hit;
    const result = await lease(async () => (await read()) ?? load());
    if (result !== null) return result;
    // Another instance owns the lease. Give its cache write a bounded chance to finish.
    const deadline = now() + waitMs;
    for (let interval = 100; now() < deadline; interval = Math.min(500, interval * 2)) {
      await sleep(Math.min(interval, deadline - now()));
      const shared = await read();
      if (shared !== null) return shared;
    }
    throw new Error('Search is still refreshing; try again shortly');
  });
}
