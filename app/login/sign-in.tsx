'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { requestData, ApiTimeoutError, RequestError } from '../../lib/client-request';
import { installMotionInput } from '../../lib/content-motion';
import { useStateEntrance } from '../../hooks/use-state-entrance';
import { AuthShell } from '../../components/auth-shell';
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
  const [sentEmail, setSentEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [retryEmail, setRetryEmail] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
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
  useEffect(() => {
    if (!retryAt) return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (!remaining) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  const [invalidEmail, setInvalidEmail] = useState(false);
  const coolingDown = secondsLeft > 0 && retryEmail === email.trim().toLowerCase();
  function waitToRetry(address: string, seconds: number) {
    setRetryEmail(address);
    setSecondsLeft(seconds);
    setRetryAt(Date.now() + seconds * 1000);
  }
  async function sendLink(address: string, resend = false) {
    if (pending.current || (secondsLeft > 0 && retryEmail === address)) return;
    const controller = new AbortController();
    pending.current = controller;
    if (resend) setResending(true);
    else setState('loading');
    setError('');
    setInvalidEmail(false);
    try {
      const data = await requestData<{ retryAfterSeconds?: number }>('/auth/login', {
        body: { email: address },
        signal: controller.signal,
      });
      setSentEmail(address);
      setResent(resend);
      setState('sent');
      waitToRetry(address, Math.max(60, data.retryAfterSeconds || 60));
    } catch (err) {
      if (controller.signal.aborted) return;
      setInvalidEmail(!resend && err instanceof RequestError && err.status === 400);
      if (err instanceof RequestError && err.retryAfterSeconds !== undefined)
        waitToRetry(address, err.retryAfterSeconds);
      else if (err instanceof ApiTimeoutError) waitToRetry(address, 60);
      setError(
        err instanceof ApiTimeoutError
          ? 'Sending took too long to confirm. Your link may still arrive; check your inbox before requesting another.'
          : (err as Error).message,
      );
      if (!resend) setState('error');
    } finally {
      pending.current = null;
      setResending(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendLink(email.trim().toLowerCase());
  }
  return (
    <AuthShell>
      <section className="login-panel">
        <p className="intro-caption">Your personal film library</p>
        <h1>Your Next Movie Night.</h1>
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
            <div ref={success} className="login-success" tabIndex={-1}>
              <Check aria-hidden="true" size={24} />
              <h2>Check Your Inbox.</h2>
              <p role="status">
                We sent {resent ? 'a new' : 'a'} sign-in link to{' '}
                <strong className="login-email">{sentEmail}</strong>. Open it on the device where
                you want to use A-List. Check Spam if it hasn’t arrived.
              </p>
              <button
                className="button subtle"
                aria-busy={resending}
                aria-describedby="sign-in-retry"
                disabled={resending || secondsLeft > 0}
                onClick={() => void sendLink(sentEmail, true)}
              >
                {resending && <LoaderCircle size={16} className="spin" aria-hidden="true" />}
                {resending ? 'Sending Your Link…' : 'Resend Link'}
              </button>
              <p id="sign-in-retry" className="login-resend-timer">
                {secondsLeft > 0 ? `You can request another link in ${secondsLeft}s.` : ''}
              </p>
              <p className="login-error" role="alert">
                {error}
              </p>
              <button
                className="text-link"
                disabled={resending}
                onClick={() => {
                  editingEmail.current = true;
                  setError('');
                  setState('idle');
                }}
              >
                Use Another Email <ArrowRight aria-hidden="true" size={14} />
              </button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <label htmlFor="email">Your Email Address</label>
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
              {coolingDown && <p className="login-resend-timer">Try again in {secondsLeft}s.</p>}
              <button
                className="button primary"
                aria-busy={state === 'loading'}
                type="submit"
                disabled={state === 'loading' || !email.trim() || coolingDown}
              >
                {state === 'loading' ? (
                  <>
                    <LoaderCircle aria-hidden="true" className="spin" size={16} />
                    Sending your link…
                  </>
                ) : (
                  <>
                    Continue with Email
                    <ArrowRight aria-hidden="true" size={16} />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
        <p id="email-note" className="login-note">
          Your email. Your own private library. <a href="/privacy">How Your Data Is Used</a>
        </p>
      </section>
    </AuthShell>
  );
}
