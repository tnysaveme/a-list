import { singleFlight } from './single-flight';

/** A writer changes the version atomically; older builds and in-flight fills cannot poison it. */
export async function versionedCache<T>(
  namespace: string,
  store: {
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
      const hit = await store.read(key);
      if (hit !== null) return { value: hit };
      const value = await store.load();
      if ((await store.version()) !== version) return null;
      await store.write(key, value);
      return { value };
    });
    if (result) return result.value;
  }
  throw new Error('Release identities changed during refresh; retry');
}
