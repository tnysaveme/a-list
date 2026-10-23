import { redirect } from 'next/navigation';
import { getUser } from '../../lib/auth';
import SignIn from './sign-in';
export const dynamic = 'force-dynamic';
export default async function Login({searchParams}:{searchParams:Promise<{error?:string}>}) {
  if (await getUser()) redirect('/');
  const query=await searchParams;
  return <SignIn expired={query.error==='expired-link'}/>;
}
