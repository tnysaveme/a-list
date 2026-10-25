import type {SupabaseClient} from '@supabase/supabase-js';
import type {User,Session} from '@supabase/supabase-js';

/** Only a validated caller's identity is used; a request body never chooses the account. */
export async function eraseOwnAccount(user:Pick<User,'id'>,session:Pick<Session,'access_token'>|null,auth:Pick<SupabaseClient['auth'],'getUser'|'admin'>){
 if(!session?.access_token)throw new Error('A current sign-in is required');
 const current=await auth.getUser(session.access_token);
 if(current.error||current.data.user?.id!==user.id)throw new Error('A current sign-in is required');
 const revoked=await auth.admin.signOut(session.access_token,'global');
 if(revoked.error)throw new Error('Account sessions could not be revoked');
 const deleted=await auth.admin.deleteUser(user.id);
 if(deleted.error)throw new Error('Account deletion could not be completed');
}
