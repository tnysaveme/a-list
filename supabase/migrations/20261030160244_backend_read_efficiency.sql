-- Recover a missing account in the same transaction as a save, without HTTP preflight calls.
create or replace function a_list_private.library_changed() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' and current_user='supabase_auth_admin' then return old; end if;
 update public.a_list_accounts set calendar_revision=calendar_revision+1,calendar_updated_at=clock_timestamp()
 where id=coalesce(new.user_id,old.user_id);
 if not found and tg_op<>'DELETE' then
  insert into public.a_list_accounts(id,calendar_revision,calendar_updated_at)
   values(new.user_id,1,clock_timestamp())
   on conflict(id) do update set calendar_revision=a_list_accounts.calendar_revision+1,calendar_updated_at=clock_timestamp();
 end if;
 return coalesce(new,old);
end;
$$;
revoke all on function a_list_private.library_changed() from public;
grant execute on function a_list_private.library_changed() to authenticated,service_role;

-- Versioned cache keys also invalidate on manual reviews and older deployed writers.
alter table public.a_list_source_status add column identity_version text not null default gen_random_uuid()::text;
create function a_list_private.release_identities_changed() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 update public.a_list_source_status set identity_version=gen_random_uuid()::text where id;
 return null;
end;
$$;
revoke all on function a_list_private.release_identities_changed() from public,anon,authenticated;
grant execute on function a_list_private.release_identities_changed() to service_role;
create trigger release_identities_changed after insert or update or delete or truncate
 on public.a_list_release_candidates for each statement execute function a_list_private.release_identities_changed();
