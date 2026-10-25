import type {SupabaseClient} from '@supabase/supabase-js';

function checked<T>({data,error}:{data:T;error:{message:string}|null}):T{
 if(error)throw new Error(error.message);return data;
}

export async function writeLibrary(db:SupabaseClient,userId:string,action:string,ids:string[]){
 if(action==='remove'){
  checked(await db.from('a_list_library').delete().eq('user_id',userId).in('movie_id',ids));
 }else if(action==='track'){
  // Older clients may still send this after saving. Calendar membership is automatic.
  checked(await db.from('a_list_library').update({tracked:true}).eq('user_id',userId).in('movie_id',ids));
 }else if(action==='add'){
  const rows=checked(await db.from('a_list_movies').select('id,movie').in('id',ids))||[];
  if(rows.length!==ids.length)throw new Error('Film not found');
  // Merge repeat saves to repair legacy membership, preserving the original added_at.
  checked(await db.from('a_list_library').upsert(rows.map(r=>({user_id:userId,movie_id:r.id,movie:r.movie,tracked:true})),{onConflict:'user_id,movie_id'}));
 }else throw new Error('Unknown library action');
}
