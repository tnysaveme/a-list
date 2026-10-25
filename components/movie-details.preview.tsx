'use client';
/** Development-only preview. Render from a temporary local page to review all states. */
import {useRef, useState} from 'react';
import {Check, ExternalLink, LoaderCircle, Plus, TriangleAlert} from 'lucide-react';
import {MovieDetails} from './movie-details';
import type {Movie} from '../lib/model';
import './movie-details.preview.css';

export default function MovieDetailsPreview({movie}:{movie:Movie}) {
 const dialog=useRef<HTMLDialogElement>(null);
 const [saved,setSaved]=useState(false);
 const [loading,setLoading]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [empty,setEmpty]=useState(false);
 const [longTitle,setLongTitle]=useState(false);
 const states=['default','hover','focus','active','disabled','loading','error','success'] as const;
 async function save(){setBusy(true);await new Promise(resolve=>setTimeout(resolve,800));setSaved(true);setBusy(false);}
 return <main className="film-preview">
  <h1>Movie details</h1>
  <div className="film-preview-tools"><button className="film-control" onClick={()=>{dialog.current?.showModal();dialog.current?.querySelector<HTMLButtonElement>('[data-autofocus]:not(:disabled)')?.focus({preventScroll:true});}}>Open modal</button><label><input type="checkbox" checked={loading} onChange={e=>setLoading(e.target.checked)}/> Checking sources</label><label><input type="checkbox" checked={empty} onChange={e=>setEmpty(e.target.checked)}/> No release dates</label><label><input type="checkbox" checked={!!error} onChange={e=>setError(e.target.checked?'The source could not be refreshed. Showing the last checked information.':'')}/> Source error</label><label><input type="checkbox" checked={longTitle} onChange={e=>setLongTitle(e.target.checked)}/> Long title stress test</label></div>
  <div className="film-preview-states">{states.map(state=><div key={state}><span>{state}</span><button className={`film-control ${['hover','focus','active'].includes(state)?`is-${state}`:''}`} disabled={state==='disabled'||state==='loading'} data-state={['loading','error','success'].includes(state)?state:undefined} aria-busy={state==='loading'}>{state==='loading'?<LoaderCircle className="spin" size={16}/>:state==='success'?<Check size={16}/>:state==='error'?<TriangleAlert size={16}/>:<Plus size={16}/>} {state==='loading'?'Saving…':state==='success'?'Saved to library':state==='error'?'Try again':'Save to library'}</button><a className={`film-control film-source ${['hover','focus','active'].includes(state)?`is-${state}`:''}`} href={state==='disabled'?undefined:movie.source} aria-disabled={state==='disabled'} data-state={['loading','error','success'].includes(state)?state:undefined}>View source<ExternalLink size={14}/></a></div>)}</div>
  <dialog ref={dialog} className="dialog movie-dialog" aria-label={`${movie.title} details`} onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close();}}><div className="dialog-inner"><MovieDetails movie={{...movie,title:longTitle?movie.title.repeat(6):movie.title,releases:empty?[]:movie.releases}} saved={saved} ready busy={busy} loading={loading} error={error} onSave={()=>void save()} onRemove={()=>setSaved(false)} onClose={()=>dialog.current?.close()}/></div></dialog>
 </main>;
}
