'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {cataloguePage,type CatalogueOptions,type CataloguePage} from '../lib/catalogue-view';
import {requestApi} from '../lib/client-api';
import type {Movie} from '../lib/model';

export function useCatalogue(initial:CataloguePage,onError:(message:string,error?:boolean)=>void){
 const [catalogue,setCatalogue]=useState(initial.movies);
 const [page,setPage]=useState(initial),[busy,setBusy]=useState(false);
 const current=useRef<AbortController|null>(null),fallback=useRef<Movie[]|null>(null);
 useEffect(()=>()=>current.current?.abort(),[]);

 const load=useCallback(async(options:CatalogueOptions={},append=false,parent?:AbortSignal)=>{
  current.current?.abort();const controller=new AbortController();current.current=controller;
  const signal=parent?AbortSignal.any([parent,controller.signal]):controller.signal;
  setBusy(true);
  try{
   const params=new URLSearchParams({sort:options.sort||'release',filter:options.filter||'all',offset:String(options.offset||0)});
   let data:CataloguePage;
   try{data=await requestApi<CataloguePage>(`catalogue?${params}`,undefined,signal);}
   catch{
    if(signal.aborted)return false;
    fallback.current??=(await import('../lib/catalogue.json')).default as Movie[];
    if(signal.aborted)return false;
    const day=new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});
    data={...cataloguePage(fallback.current,options,day),stale:true};
   }
   if(signal.aborted)return false;
   setCatalogue(previous=>{
    if(!append)return data.movies;
    const ids=new Set(previous.map(movie=>movie.id));
    return [...previous,...data.movies.filter(movie=>!ids.has(movie.id))];
   });
   setPage(data);
   return true;
  }catch(error){if(!signal.aborted)onError(error instanceof Error?error.message:'Could not load films.',true);return false;}
  finally{if(current.current===controller)setBusy(false);}
 },[onError]);
 return {catalogue,setCatalogue,page,busy,load};
}
