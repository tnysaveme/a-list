import { redirect } from 'next/navigation';
import { getUser } from '../../lib/auth';
import SignIn from './sign-in';
export const dynamic = 'force-dynamic';
export default async function Login() {
  if (await getUser()) redirect('/');
  return <SignIn/>;
}
