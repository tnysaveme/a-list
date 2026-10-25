import test from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient,Session} from '@supabase/supabase-js';
import {eraseOwnAccount} from '../lib/account-privacy';

test('account deletion uses the authenticated identity and revokes all sessions before permanent deletion',async()=>{
 const calls:string[]=[];
 const session={access_token:'test-session'} as Session;
 const auth={async getUser(){return {data:{user:{id:'caller'}},error:null};},admin:{async signOut(token:string,scope:string){calls.push(`revoke:${token}:${scope}`);return {error:null};},async deleteUser(id:string){calls.push(`delete:${id}`);return {error:null};}}} as unknown as SupabaseClient['auth'];
 await eraseOwnAccount({id:'caller'},session,auth);
 assert.deepEqual(calls,['revoke:test-session:global','delete:caller']);
 calls.length=0;
 await assert.rejects(eraseOwnAccount({id:'other'},session,auth),/current sign-in/);assert.deepEqual(calls,[]);
 await assert.rejects(eraseOwnAccount({id:'caller'},null,auth),/current sign-in/);assert.deepEqual(calls,[]);
 const failed={...auth,admin:{...auth.admin,async signOut(){return {error:new Error('upstream error')};}}} as unknown as SupabaseClient['auth'];
 await assert.rejects(eraseOwnAccount({id:'caller'},session,failed),/sessions could not/);assert.deepEqual(calls,[]);
});
