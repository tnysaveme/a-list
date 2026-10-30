import AList from './afterlight';
import { readNavigation } from '../lib/navigation-state';
import { getUser } from '../lib/auth';
import { redirect } from 'next/navigation';
import snapshot from '../lib/catalogue.json';
import { cataloguePage } from '../lib/catalogue-view';
import type { Movie } from '../lib/model';
import { context, initializeLibrary } from '../lib/data';
import type { LibraryInit } from '../lib/api-contract';
export const dynamic = 'force-dynamic';
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await getUser();
  if (!user) redirect('/login');
  let initialLibrary: LibraryInit | null = null;
  try {
    initialLibrary = await initializeLibrary(await context(user.id), AbortSignal.timeout(3500));
  } catch {
    console.warn(JSON.stringify({ event: 'library_bootstrap_deferred' }));
  }
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const initialCatalogue =
    initialLibrary?.total === 0
      ? cataloguePage(snapshot as Movie[], {}, day)
      : { movies: [], total: 0, filteredTotal: 0, nextOffset: null };
  return (
    <AList
      initialNavigation={
        ['section', 'filter', 'sort'].some((key) => typeof params[key] === 'string')
          ? readNavigation(
              new URLSearchParams(
                Object.entries(params).filter(
                  (entry): entry is [string, string] => typeof entry[1] === 'string',
                ),
              ),
              initialLibrary?.total === 0 ? 'discover' : 'library',
            )
          : null
      }
      initialLibrary={initialLibrary}
      initialCatalogue={{ ...initialCatalogue, stale: true }}
    />
  );
}
