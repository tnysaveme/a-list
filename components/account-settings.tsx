'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowDownToLine,CalendarDays,LoaderCircle,Trash2,X} from 'lucide-react';
import './account-settings.css';

export default function AccountSettings({onClose,onFeedReset,onCalendar}:{onClose:()=>void;onFeedReset:(path:string)=>void;onCalendar:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const confirmationInput=useRef<HTMLInputElement>(null),resetButton=useRef<HTMLButtonElement>(null),deleteButton=useRef<HTMLButtonElement>(null),calendarButton=useRef<HTMLButtonElement>(null);
 const [confirm,setConfirm]=useState<'reset'|'delete'|null>(null),[typed,setTyped]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[reset,setReset]=useState(false);
 useEffect(()=>{const element=dialog.current!;element.showModal();const before=document.body.style.overflow;document.body.style.overflow='clip';return()=>{element.close();document.body.style.overflow=before;};},[]);
 useEffect(()=>{if(confirm)confirmationInput.current?.focus();},[confirm]);
 useEffect(()=>{if(reset)calendarButton.current?.focus();},[reset]);
 function choose(value:'reset'|'delete'|null){if(!value)(confirm==='reset'?resetButton:deleteButton).current?.focus();setConfirm(value);setTyped('');setError('');setMessage('');}
 async function download(){
  setBusy(true);setError('');setMessage('');
  try{
   const response=await fetch('/api/account/export');
   if(!response.ok){const data=await response.json();throw new Error(data.error||'Your library could not be exported.');}
   const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');
   link.href=url;link.download=`a-list-library-${new Date().toISOString().slice(0,10)}.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
   setMessage('Your library export has been downloaded.');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function submit(event:FormEvent){
  event.preventDefault();if(!confirm||typed!==(confirm==='reset'?'RESET':'DELETE'))return;
  setBusy(true);setError('');setMessage('');
  try{
   const response=await fetch(`/api/account/${confirm==='reset'?'reset-calendar':'delete'}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmation:typed})});
   const data=await response.json();if(!response.ok)throw new Error(data.error||'This action could not be completed.');
   if(confirm==='delete'){window.location.replace('/login?deleted=1');return;}
   onFeedReset(data.feedPath);setReset(true);setConfirm(null);setTyped('');setMessage('Your old calendar link no longer works. Remove the old subscription from your calendar app, then subscribe again with the new link.');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <dialog ref={dialog} className="dialog account-dialog" aria-labelledby="account-title" onCancel={e=>{if(busy)e.preventDefault();}} onClose={onClose} onClick={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><div className="dialog-inner">
  <button className="dialog-close icon-button" aria-label="Close account settings" disabled={busy} onClick={onClose}><X size={20}/></button>
  <h2 id="account-title">Your account.</h2><p className="account-intro">A few simple controls for your collection and calendar.</p>
  <section className="account-section"><h3>Your library, to keep.</h3><p>Download your saved films, including films waiting for a date, and your calendar preference as a JSON file. Your secret calendar link is excluded.</p><button className="button subtle" onClick={download} disabled={busy}><ArrowDownToLine size={16}/>Export library</button></section>
  <section className="account-section"><h3>A fresh calendar link.</h3><p>Anyone with your calendar link can read its events. Reset it if it has been shared accidentally.</p><button ref={resetButton} className="button subtle" onClick={()=>choose('reset')} disabled={busy}><CalendarDays size={16}/>Reset calendar link</button></section>
  <section className="account-section"><h3>Close your account.</h3><p>Delete your sign-in account, saved films and calendar settings. Your shared movie catalogue stays available to your friends.</p><button ref={deleteButton} className="button subtle account-danger" onClick={()=>choose('delete')} disabled={busy}><Trash2 size={16}/>Delete account</button></section>
  {confirm&&<form className="account-confirm" onSubmit={submit}>
   <h3>{confirm==='reset'?'Reset your calendar link?':'Delete your account permanently?'}</h3>
   <p>{confirm==='reset'?'The old link will stop working immediately. Remove the old subscription in your calendar app, then subscribe again. Your saved films stay in your library.':'This permanently removes your account and library and signs you out on all devices. It cannot be undone. Export your library first if you want a copy. Remove the old subscription or downloaded events from your calendar app yourself.'}</p>
   <label htmlFor="account-confirmation">Type {confirm==='reset'?'RESET':'DELETE'} to confirm</label><input ref={confirmationInput} id="account-confirmation" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={typed} onChange={e=>setTyped(e.target.value)} maxLength={6} disabled={busy}/>
   <div className="account-actions"><button className={`button primary ${confirm==='delete'?'account-danger-action':''}`} disabled={busy||typed!==(confirm==='reset'?'RESET':'DELETE')}>{busy?<LoaderCircle size={16} className="spin"/>:null}{confirm==='reset'?'Reset link':'Delete account permanently'}</button><button type="button" className="button subtle" disabled={busy} onClick={()=>choose(null)}>Cancel</button></div>
  </form>}
  {error&&<p className="account-error" role="alert">{error}</p>}{message&&<p className="account-message" role="status">{message}</p>}
  {reset&&<button ref={calendarButton} className="button primary" disabled={busy} onClick={onCalendar}>Open calendar settings</button>}
  <form action="/auth/signout" method="post"><button className="button subtle account-signout" disabled={busy}>Sign out</button></form>
  <p className="account-data-note">Your email is used for sign-in. Your library belongs to your account. <a href="/privacy" target="_blank" rel="noreferrer">How your data is used</a></p>
 </div></dialog>;
}
