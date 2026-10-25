-- Compare the version read before upstream enrichment, and return the records
-- actually retained so a stale candidate cannot enter the shared cache either.
create function public.a_list_publish_catalogue_versioned(p_movies jsonb,p_checked_at timestamptz,p_versions jsonb)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare published jsonb;
begin
 if jsonb_typeof(p_movies) is distinct from 'array' or jsonb_typeof(p_versions) is distinct from 'object'
  or p_checked_at is null then raise exception 'Invalid catalogue publication'; end if;
 if exists(select 1 from jsonb_array_elements(p_movies) m where not (p_versions ? (m->>'id')))
  or (select count(*)<>count(distinct m->>'id') from jsonb_array_elements(p_movies) m)
 then raise exception 'Catalogue versions required'; end if;

 insert into public.a_list_movies(id,movie,updated_at)
 select m->>'id',m,p_checked_at from jsonb_array_elements(p_movies) m order by m->>'id'
 on conflict(id) do update set movie=excluded.movie,updated_at=excluded.updated_at
 where a_list_movies.updated_at=(p_versions->>excluded.id)::timestamptz
  and a_list_movies.movie is distinct from excluded.movie;

 -- This separate statement sees rows retained after a conflicting insert/update.
 select coalesce(jsonb_agg(m.movie order by candidate.position),'[]'::jsonb) into published
 from jsonb_array_elements(p_movies) with ordinality as candidate(movie,position)
 join public.a_list_movies m on m.id=candidate.movie->>'id';
 update public.a_list_source_status set catalogue=published,catalogue_success_at=p_checked_at where id;
 return published;
end;
$$;
revoke all on function public.a_list_publish_catalogue_versioned(jsonb,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.a_list_publish_catalogue_versioned(jsonb,timestamptz,jsonb) to service_role;

-- Old workers lack row versions. They may add films, but cannot replace rows
-- until the version-aware application has been deployed.
create or replace function public.a_list_publish_catalogue(p_movies jsonb,p_checked_at timestamptz) returns void
 language plpgsql security invoker set search_path='' as $$
begin
 perform public.a_list_publish_catalogue_versioned(p_movies,p_checked_at,coalesce((
  select jsonb_object_agg(m->>'id','null'::jsonb) from jsonb_array_elements(p_movies) m
 ),'{}'::jsonb));
end;
$$;
revoke all on function public.a_list_publish_catalogue(jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.a_list_publish_catalogue(jsonb,timestamptz) to service_role;
