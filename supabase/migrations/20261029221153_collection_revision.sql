-- The latest meaningful release-content update is an indexed scalar, not a catalogue scan.
create index a_list_movies_calendar_updated on public.a_list_movies(calendar_updated_at desc);

-- Existing RLS restricts the account component to the caller. No feed tokens or movie data leave it.
create function public.a_list_collection_revision() returns text
 language sql stable security invoker set search_path='' as $$
 select md5(coalesce((select version from public.a_list_source_status where id),'')||':'||
  coalesce((select extract(epoch from max(calendar_updated_at))::text from public.a_list_movies),'')||':'||
  coalesce((select calendar_revision::text from public.a_list_accounts where id=auth.uid()),'')||':'||
  (now() at time zone 'America/New_York')::date::text)
 where auth.uid() is not null;
$$;
revoke all on function public.a_list_collection_revision() from public,anon,authenticated;
grant execute on function public.a_list_collection_revision() to authenticated,service_role;

-- Recheck unresolved identities under matching rule 7 without changing approved mappings.
update public.a_list_wts_profiles set check_after=least(check_after,now()),attempts=0,failures=0,
 priority=greatest(priority,1)
 where outcome in ('ambiguous_identity','insufficient_evidence');
