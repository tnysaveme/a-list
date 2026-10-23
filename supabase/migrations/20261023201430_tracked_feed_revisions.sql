-- Unrelated film updates must not invalidate every subscriber's calendar.
create or replace function a_list_private.calendar_state(p_token text) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
declare a public.a_list_accounts%rowtype; source_version text; source_updated timestamptz;
begin
 if p_token is null or p_token !~ '^[a-f0-9-]{68}$' then return null; end if;
 select * into a from public.a_list_accounts where feed_token=p_token;
 if not found or (auth.uid() is not null and auth.uid()<>a.id) then return null; end if;
 -- Read narrow version columns, not film JSON or upstream sources, on cache hits.
 select md5(coalesce(string_agg(l.movie_id||':'||coalesce(m.updated_at::text,'snapshot'),',' order by l.movie_id),'')),max(m.updated_at)
 into source_version,source_updated
 from public.a_list_library l left join public.a_list_movies m on m.id=l.movie_id
 where l.user_id=a.id and l.tracked;
 return jsonb_build_object('revision',a.calendar_revision::text,'sourcesVersion',source_version,
  'modifiedAt',greatest(a.calendar_updated_at,source_updated),'includeRumors',a.include_rumors);
end;
$$;
revoke all on function a_list_private.calendar_state(text) from public;
grant execute on function a_list_private.calendar_state(text) to anon,authenticated;
