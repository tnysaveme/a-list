import type { CollectionQuery } from './collection-query';
export type CollectionNavigation = CollectionQuery & { section: 'library' | 'discover' };
export function readNavigation(
  params: URLSearchParams,
  fallback: 'library' | 'discover',
): CollectionNavigation {
  const section =
    params.get('section') === 'discover'
      ? 'discover'
      : params.get('section') === 'library'
        ? 'library'
        : fallback;
  const filter = params.get('filter') || 'all';
  const sort = params.get('sort') || 'release';
  return {
    section,
    filter: ['all', 'soon', 'available', 'unknown', 'rumored'].includes(filter) ? filter : 'all',
    sort: (section === 'discover'
      ? ['release', 'title', 'theatrical']
      : ['release', 'title', 'added', 'theatrical']
    ).includes(sort)
      ? sort
      : 'release',
  };
}
export function navigationUrl(current: string, navigation: CollectionNavigation) {
  const url = new URL(current);
  url.searchParams.set('section', navigation.section);
  for (const key of ['filter', 'sort'] as const) {
    if (navigation[key] === (key === 'filter' ? 'all' : 'release')) url.searchParams.delete(key);
    else url.searchParams.set(key, navigation[key]);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
