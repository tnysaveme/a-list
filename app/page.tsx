import AList from './afterlight';
import { getUser } from '../lib/auth';
import { redirect } from 'next/navigation';
import snapshot from '../lib/catalogue.json';
import { cataloguePage } from '../lib/catalogue-view';
import type { Movie } from '../lib/model';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const user = await getUser();
  if (!user) redirect('/login');
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const initialCatalogue = cataloguePage(snapshot as Movie[], {}, day);
  return <AList initialCatalogue={{ ...initialCatalogue, stale: true }} />;
}
