'use client';
import {useState, type FormEvent} from 'react';
import {ArrowRight, Mail, LoaderCircle, Check} from 'lucide-react';
export default function SignIn({expired=false,deleted=false}:{expired?:boolean;deleted?:boolean}) {
  const [email,setEmail]=useState('');
  const [state,setState]=useState<'idle'|'loading'|'sent'|'error'>('idle');
  const [error,setError]=useState(expired?'That sign-in link has expired or was opened in another browser. Request a new one below.':'');
  const [invalidEmail,setInvalidEmail]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setState('loading');setError('');setInvalidEmail(false);
    try {
      const response=await fetch('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
      const data=await response.json();if(!response.ok){setInvalidEmail(response.status===400);throw new Error(data.error||'Could not send your sign-in link.');}setState('sent');
    } catch(err) {setError((err as Error).message);setState('error');}
  }
  return <main className="login-shell"><div className="login-brand wordmark"><span className="brand-symbol" aria-hidden="true">A</span>A-List<span className="wordmark-period">.</span></div><section className="login-panel"><p className="intro-caption">Your own little corner of cinema.</p><h1>For your next<br/>movie night.</h1>{deleted&&<p className="login-note" role="status">Your account and saved library have been deleted.</p>}<p className="login-copy">Save the films. Follow the dates. Keep something good to look forward to.</p>{state==='sent'?<div className="login-success" role="status"><Check size={24}/><h2>Check your inbox.</h2><p>We sent you a sign-in link. Open it in this browser to return to your library.</p><button className="text-link" onClick={()=>setState('idle')}>Use another email <ArrowRight size={14}/></button></div>:<form onSubmit={submit}><label htmlFor="email">Your email address</label><div className="login-input" data-invalid={invalidEmail||undefined}><Mail size={18}/><input id="email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} placeholder="you@example.com" value={email} aria-describedby={error?'email-error':'email-note'} aria-invalid={invalidEmail} onInvalid={e=>{e.preventDefault();e.currentTarget.focus();setInvalidEmail(true);setState('error');setError('Enter a complete email address, such as name@example.com.');}} onChange={e=>{setEmail(e.target.value);if(error){setError('');setInvalidEmail(false);setState('idle');}}} disabled={state==='loading'}/></div><p id="email-error" className="login-error" role="alert">{error}</p><button className="button primary" type="submit" disabled={state==='loading'||!email.trim()}>{state==='loading'?<><LoaderCircle className="spin" size={16}/>Sending your link…</>:<>Email me a sign-in link<ArrowRight size={16}/></>}</button></form>}<p id="email-note" className="login-note">Your email. Your own private library. <a href="/privacy">How your data is used</a></p></section><p className="login-colophon">The big screen. Then your screen.</p></main>;
}
