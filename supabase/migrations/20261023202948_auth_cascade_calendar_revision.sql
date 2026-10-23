create or replace function a_list_private.library_changed() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 -- Auth owns user deletion and cascades the whole account. Its restricted role
 -- needs no calendar revision update: deleting the account revokes the feed.
 if tg_op='DELETE' and current_user='supabase_auth_admin' then return old; end if;
 update public.a_list_accounts set calendar_revision=calendar_revision+1,calendar_updated_at=clock_timestamp()
 where id=coalesce(new.user_id,old.user_id);
 return coalesce(new,old);
end;
$$;
revoke all on function a_list_private.library_changed() from public;
grant execute on function a_list_private.library_changed() to authenticated,service_role;
