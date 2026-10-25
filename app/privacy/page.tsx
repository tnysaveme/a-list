import type { Metadata } from 'next';
import Link from 'next/link';
import './privacy.css';
export const metadata: Metadata = {
  title: 'Your data — A-List',
  description: 'How A-List uses your email, saved films and private calendar link.',
};
export default function Privacy() {
  return (
    <main className="privacy-page">
      <Link href="/" className="privacy-home">
        A-List.
      </Link>
      <h1>Your data.</h1>
      <p>
        A-List is a small movie tracker for its owner and friends. This note explains what the app
        keeps and the controls available to you.
      </p>
      <h2>What is saved</h2>
      <p>
        Your email is used to send sign-in links. Your account stores your saved movie IDs, the time
        you saved them, your reported-date preference and a secret calendar link. Movie metadata and
        release evidence are shared across the app; your personal library is separate.
      </p>
      <h2>Your private calendar</h2>
      <p>
        Anyone with your calendar link can read its events without signing in. Keep the link
        private. Account settings let you reset it: the old link stops serving events immediately,
        and you will need to remove the old subscription and subscribe again in your calendar app.
      </p>
      <h2>The services involved</h2>
      <p>
        <a href="https://supabase.com/privacy" target="_blank" rel="noreferrer">
          Supabase
        </a>{' '}
        handles authentication and database storage,{' '}
        <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noreferrer">
          Resend
        </a>{' '}
        delivers sign-in emails,{' '}
        <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noreferrer">
          Vercel
        </a>{' '}
        hosts the app, and{' '}
        <a href="https://upstash.com/trust/privacy.pdf" target="_blank" rel="noreferrer">
          Upstash
        </a>{' '}
        handles caches and scheduled work. These services process the network and request
        information needed to operate the app. Poster hosts may receive image requests. Source links
        open the original provider’s website.
      </p>
      <h2>Your controls</h2>
      <p>
        In Account settings you can download your library as JSON, reset your calendar link, or
        permanently delete your account. The export includes films without dates and excludes the
        secret calendar link.
      </p>
      <p>
        Deleting your account removes your active sign-in account, saved films, account preferences
        and account-scoped source cache, and revokes its calendar link. Shared movie information
        remains. Cached calendar copies expire within an hour; a revoked link cannot serve them.
        Copies already downloaded to your devices are controlled by your calendar app. Providers may
        retain operational logs and backups according to their own retention settings.
      </p>
      <p className="privacy-updated">Updated October 25, 2026.</p>
      <Link href="/" className="privacy-home">
        Back to A-List
      </Link>
    </main>
  );
}
