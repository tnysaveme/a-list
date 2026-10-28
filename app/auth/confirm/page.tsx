import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Wordmark } from '../../../components/wordmark';
import { validEmailToken } from '../../../lib/email-auth';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'strict-origin',
};

/** A GET only displays confirmation; scanners cannot redeem a sign-in token. */
export default async function ConfirmEmail({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string }>;
}) {
  const { token_hash: tokenHash } = await searchParams;
  if (!validEmailToken(tokenHash)) redirect('/login?error=expired-link');
  return (
    <main className="login-shell">
      <div className="login-brand">
        <Wordmark />
      </div>
      <section className="login-panel">
        <h1>Continue to A-List.</h1>
        <p className="login-copy">
          Confirm this sign-in to open your personal film library in this browser.
        </p>
        <form action="/auth/verify" method="post">
          <input type="hidden" name="token_hash" value={tokenHash} />
          <button className="button primary" type="submit">
            Confirm & sign in
          </button>
        </form>
        <p className="login-note">
          Only continue if you requested this email. This link works once.
        </p>
        <a className="text-link" href="/login">
          Request a new sign-in email
        </a>
      </section>
    </main>
  );
}
