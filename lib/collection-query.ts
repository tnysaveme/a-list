export type CollectionQuery = { sort: string; filter: string };
export const initialQuery: CollectionQuery = { sort: 'release', filter: 'all' };
export const collectionFreshMs = 60_000;
export const sameQuery = (a: CollectionQuery, b: CollectionQuery) =>
  a.sort === b.sort && a.filter === b.filter;
export type CollectionError = {
  query: CollectionQuery;
  offset: number;
  append: boolean;
  refresh: boolean;
};
