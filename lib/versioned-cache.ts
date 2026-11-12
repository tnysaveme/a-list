import { sharedSearch } from './shared-search';
import { singleFlight } from './single-flight';

type Fill<T> = { value: T } | { changed: true };

/** A writer changes the version atomically; older builds and in-flight fills cannot poison it. */
export async function versionedCache<T>(
  namespace: string,
  store: {
    lease?: (key: string, work: () => Promise<Fill<T>>) => Promise<Fill<T> | null>;
    version: () => Promise<string>;
    read: (key: string) => Promise<T | null>;
    load: () => Promise<T>;
    write: (key: string, value: T) => Promise<unknown>;
  },
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const version = await store.version();
    const key = `${namespace}:${version}`;
    const result = await singleFlight(key, async () => {
      const fill = async () => {
        const value = await store.load();
        if ((await store.version()) !== version) return { changed: true as const };
        await store.write(key, value);
        return { value };
      };
      const hit = await store.read(key);
      if (hit !== null) return { value: hit };
      if (!store.lease) return fill();
      return sharedSearch<Fill<T>>(`fill:${key}`, {
        read: async () => {
          const value = await store.read(key);
          return value === null ? null : { value };
        },
        lease: (work) => store.lease!(key, work),
        load: fill,
        waitMs: 1200,
      });
    });
    if (result && 'value' in result) return result.value;
  }
  throw new Error('Shared data changed during refresh; retry');
}
