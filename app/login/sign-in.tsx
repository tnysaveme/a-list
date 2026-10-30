'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { requestData, ApiTimeoutError, RequestError } from '../../lib/client-request';
import { installMotionInput } from '../../lib/content-motion';
import { useStateEntrance } from '../../hooks/use-state-entrance';
import { Wordmark } from '../../components/wordmark';
import { ArrowRight, Mail, LoaderCircle, Check } from 'lucide-react';
export default function SignIn({
  expired = false,
  deleted = false,
  authError,
}: {
  expired?: boolean;
  deleted?: boolean;
  authError?: string;
}) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [error, setError] = useState(
    expired
      ? 'That sign-in link has expired or was already used. Request a new one below.'
      : authError === 'service-unavailable'
        ? 'Sign-in is temporarily unavailable. Please try the email link again shortly.'
        : authError === 'rate-limit'
          ? 'Too many sign-in attempts. Please wait a few minutes, then try again.'
          : '',
  );
  const pending = useRef<AbortController | null>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const editingEmail = useRef(false);
  const success = useStateEntrance<HTMLDivElement>(state === 'sent');
  useEffect(installMotionInput, []);
  useEffect(() => {
    if (state === 'sent') success.current?.focus({ preventScroll: true });
    if (state === 'idle' && editingEmail.current) {
      editingEmail.current = false;
      emailInput.current?.focus();
    }
  }, [state, success]);
  useEffect(() => () => pending.current?.abort(), []);
  const [invalidEmail, setInvalidEmail] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setState('loading');
    setError('');
    setInvalidEmail(false);
    try {
      await requestData('/auth/login', { body: { email }, signal: controller.signal });
      setState('sent');
    } catch (err) {
      if (controller.signal.aborted) return;
      setInvalidEmail(err instanceof RequestError && err.status === 400);
      setError(
        err instanceof ApiTimeoutError
          ? 'Sending took too long to confirm. Your link may still arrive; check your inbox before requesting another.'
          : (err as Error).message,
      );
      setState('error');
    } finally {
      pending.current = null;
    }
  }
  return (
    <main className="login-shell">
      <div className="login-brand">
        <Wordmark />
      </div>
      <section className="login-panel">
        <p className="intro-caption">Your personal film library</p>
        <h1>Your next movie night.</h1>
        {deleted && (
          <p className="login-note" role="status">
            Your account and saved library have been deleted.
          </p>
        )}
        <p className="login-copy">
          Save films you want to see. Follow their digital and streaming releases, all in one place.
        </p>
        <div className="login-state">
          {state === 'sent' ? (
            <div ref={success} className="login-success" role="status" tabIndex={-1}>
              <Check aria-hidden="true" size={24} />
              <h2>Check your inbox.</h2>
              <p>
                We sent you a sign-in link. Open it on the device where you want to use A-List.
                Check Spam if it hasn’t arrived.
              </p>
              <button
                className="text-link"
                onClick={() => {
                  editingEmail.current = true;
                  setState('idle');
                }}
              >
                Use another email <ArrowRight aria-hidden="true" size={14} />
              </button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <label htmlFor="email">Your email address</label>
              <div className="login-input" data-invalid={invalidEmail || undefined}>
                <Mail aria-hidden="true" size={18} />
                <input
                  ref={emailInput}
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  maxLength={254}
                  placeholder="you@example.com"
                  value={email}
                  aria-describedby={error ? 'email-error' : 'email-note'}
                  aria-invalid={invalidEmail}
                  onInvalid={(e) => {
                    e.preventDefault();
                    e.currentTarget.focus();
                    setInvalidEmail(true);
                    setState('error');
                    setError('Enter a complete email address, such as name@example.com.');
                  }}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) {
                      setError('');
                      setInvalidEmail(false);
                      setState('idle');
                    }
                  }}
                  disabled={state === 'loading'}
                />
              </div>
              <p id="email-error" className="login-error" role="alert">
                {error}
              </p>
              <button
                className="button primary"
                aria-busy={state === 'loading'}
                type="submit"
                disabled={state === 'loading' || !email.trim()}
              >
                {state === 'loading' ? (
                  <>
                    <LoaderCircle aria-hidden="true" className="spin" size={16} />
                    Sending your link…
                  </>
                ) : (
                  <>
                    Continue with email
                    <ArrowRight aria-hidden="true" size={16} />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
        <p id="email-note" className="login-note">
          Your email. Your own private library. <a href="/privacy">How your data is used</a>
        </p>
      </section>
      <p className="login-colophon">Films worth looking forward to.</p>
    </main>
  );
}
