import type { ReactNode } from 'react';
import { AuthArtwork } from './auth-artwork';
import signInArtwork from '../public/sign-in-cinema.webp';
import confirmationArtwork from '../public/confirmation-cinema.webp';
import { Wordmark } from './wordmark';

export function AuthShell({
  children,
  variant = 'sign-in',
}: {
  children: ReactNode;
  variant?: 'sign-in' | 'confirmation';
}) {
  const confirmation = variant === 'confirmation';
  return (
    <main className="login-shell">
      <aside
        className={`login-cinema${confirmation ? ' login-cinema-confirmation' : ''}`}
        aria-hidden="true"
      >
        <AuthArtwork
          key={confirmation ? confirmationArtwork.src : signInArtwork.src}
          image={confirmation ? confirmationArtwork : signInArtwork}
        />
        <div className="login-cinema-copy">
          <Wordmark />
          <p>Cinema at home</p>
        </div>
      </aside>
      {children}
      <p className="login-colophon">Films worth looking forward to.</p>
    </main>
  );
}
