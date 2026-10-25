-- A source check and a changed calendar event are separate revisions.
alter table public.a_list_movies add column calendar_updated_at timestamptz not null default clock_timestamp();
update public.a_list_movies set calendar_updated_at=updated_at;

create function a_list_private.calendar_content(p_movie jsonb) returns jsonb
 language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',p_movie->>'id','title',p_movie->>'title','releases',coalesce((
  select jsonb_agg(jsonb_build_object('kind',r->>'kind','date',r->>'date','confidence',r->>'confidence',
   'source',r->>'source','sourceName',r->>'sourceName','platform',r->>'platform') order by position)
  from jsonb_array_elements(a_list_private.verified_movie(p_movie)->'releases') with ordinality as releases(r,position)
 ),'[]'::jsonb));
$$;
revoke all on function a_list_private.calendar_content(jsonb) from public,anon,authenticated;
grant execute on function a_list_private.calendar_content(jsonb) to service_role;

create function a_list_private.movie_calendar_changed() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 new.calendar_updated_at=case
  when a_list_private.calendar_content(new.movie) is distinct from a_list_private.calendar_content(old.movie)
  then clock_timestamp() else old.calendar_updated_at end;
 return new;
end;
$$;
revoke all on function a_list_private.movie_calendar_changed() from public,anon,authenticated;
grant execute on function a_list_private.movie_calendar_changed() to service_role;
create trigger movie_calendar_changed before update on public.a_list_movies
 for each row execute function a_list_private.movie_calendar_changed();

create or replace function a_list_private.calendar_state(p_token text) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
declare a public.a_list_accounts%rowtype; source_version text; source_updated timestamptz;
begin
 if p_token is null or p_token !~ '^[a-f0-9-]{68}$' then return null; end if;
 select * into a from public.a_list_accounts where feed_token=p_token;
 if not found or (auth.uid() is not null and auth.uid()<>a.id) then return null; end if;
 select md5(coalesce(string_agg(l.movie_id||':'||coalesce(m.calendar_updated_at::text,'snapshot'),',' order by l.movie_id),'')),max(m.calendar_updated_at)
 into source_version,source_updated
 from public.a_list_library l left join public.a_list_movies m on m.id=l.movie_id
 where l.user_id=a.id and l.tracked;
 return jsonb_build_object('revision',a.calendar_revision::text,'sourcesVersion',source_version,
  'modifiedAt',greatest(a.calendar_updated_at,source_updated),'includeRumors',a.include_rumors);
end;
$$;

create or replace function a_list_private.read_calendar(p_token text) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
declare a public.a_list_accounts%rowtype;
begin
 if p_token is null or p_token !~ '^[a-f0-9-]{68}$' then return null; end if;
 select * into a from public.a_list_accounts where feed_token=p_token;
 if not found or (auth.uid() is not null and auth.uid()<>a.id) then return null; end if;
 return jsonb_build_object('includeRumors',a.include_rumors,'movies',coalesce((
  select jsonb_agg(coalesce(m.movie,l.movie)||jsonb_build_object('calendarUpdatedAt',coalesce(m.calendar_updated_at,l.added_at)) order by l.movie_id)
  from public.a_list_library l left join public.a_list_movies m on m.id=l.movie_id
  where l.user_id=a.id and l.tracked),'[]'::jsonb));
end;
$$;
revoke all on function a_list_private.calendar_state(text),a_list_private.read_calendar(text) from public;
grant execute on function a_list_private.calendar_state(text),a_list_private.read_calendar(text) to anon,authenticated;
