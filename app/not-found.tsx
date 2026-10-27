import Link from 'next/link';
import { Wordmark } from '../components/wordmark';

export default function NotFound() {
  return (
    <main className="login-shell app-error-shell">
      <section className="login-panel">
        <Wordmark className="error-brand" />
        <p className="intro-caption">Page not found</p>
        <h1>This page isn’t here.</h1>
        <p className="login-copy">Return to your library to find your next film.</p>
        <Link className="button primary not-found-home" href="/">
          Back to A-List
        </Link>
      </section>
    </main>
  );
}
