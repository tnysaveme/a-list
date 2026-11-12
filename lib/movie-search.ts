import { fetchSource, parseSearchResults } from './sources';
import { titleKey } from './film-identity';
import { mergeSearchProviders, searchMetadata } from './metadata';
import { verifySearchListings } from './source-verification';

export async function searchProviders(query: string, budgetMs = 5500, parent?: AbortSignal) {
  const own = AbortSignal.timeout(budgetMs);
  const signal = parent ? AbortSignal.any([parent, own]) : own;
  const providersSignal = AbortSignal.any([
    signal,
    AbortSignal.timeout(Math.max(1, budgetMs - 1500)),
  ]);
  const providers = await Promise.allSettled([
    fetchSource('https://www.dvdsreleasedates.com/search/', {
      signal: providersSignal,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ searchStr: query }).toString(),
    }).then((html) => parseSearchResults(html)),
    searchMetadata(query, providersSignal),
  ]);
  if (providers.every((r) => r.status === 'rejected'))
    throw new Error('Movie search sources unavailable');
  const listing = providers[0].status === 'fulfilled' ? providers[0].value : [],
    metadata = providers[1].status === 'fulfilled' ? providers[1].value : [];
  const verified = await verifySearchListings(listing, metadata, signal);
  const term = titleKey(query);
  const movies = mergeSearchProviders(verified, metadata)
    .sort((a, b) => Number(titleKey(b.title) === term) - Number(titleKey(a.title) === term))
    .slice(0, 24);
  return { movies, metadata, degraded: providers.some((r) => r.status === 'rejected') };
}
