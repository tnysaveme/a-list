'use client';
import { Wordmark } from '../components/wordmark';
export default function AppError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="login-shell app-error-shell">
      <section className="login-panel">
        <Wordmark className="error-brand" />
        <h1>We couldn’t open this page.</h1>
        <p role="alert">This page is temporarily unavailable. Please try again shortly.</p>
        <button className="button primary" onClick={() => retry()}>
          Try Again
        </button>
        <p>
          <a href="/login">Return to sign-in</a>
        </p>
      </section>
    </main>
  );
}
