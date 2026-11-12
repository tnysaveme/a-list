import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthShell } from '../../../components/auth-shell';
import { ArrowRight } from 'lucide-react';
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
    <AuthShell variant="confirmation">
      <section className="login-panel auth-confirm-panel" aria-labelledby="confirm-heading">
        <h1 id="confirm-heading">Your Library Awaits.</h1>
        <p className="login-copy">
          Confirm this sign-in to open your personal film library in this browser.
        </p>
        <form action="/auth/verify" method="post">
          <input type="hidden" name="token_hash" value={tokenHash} />
          <button className="button primary" type="submit">
            Confirm & sign in <ArrowRight size={16} aria-hidden="true" />
          </button>
        </form>
        <p className="login-note auth-confirm-note">
          Only continue if you requested this email. This link works once.
        </p>
        <div className="auth-confirm-recovery">
          <p>Need a fresh link?</p>
          <a className="text-link" href="/login">
            Request a new sign-in email <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
      </section>
    </AuthShell>
  );
}
