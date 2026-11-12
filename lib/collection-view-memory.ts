import { collectionFreshMs, type CollectionQuery } from './collection-query';

/** Small, account-local view cache. Mutations/revisions clear it; it never persists. */
export class CollectionViewMemory<T extends { movies: unknown[] }> {
  private entries = new Map<string, { value: T; day: string; at: number; extent: number }>();
  private key(query: CollectionQuery) {
    return `${query.filter}:${query.sort}`;
  }
  read(query: CollectionQuery, day: string, now = Date.now()) {
    const key = this.key(query),
      entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.day !== day || now - entry.at >= collectionFreshMs) {
      this.entries.delete(key);
      return null;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry;
  }
  remember(query: CollectionQuery, value: T, day: string, extent: number, now = Date.now()) {
    const key = this.key(query);
    this.entries.delete(key);
    if (value.movies.length > 250) return;
    this.entries.set(key, { value, day, at: now, extent });
    if (this.entries.size > 6) this.entries.delete(this.entries.keys().next().value!);
  }
  clear() {
    this.entries.clear();
  }
}
