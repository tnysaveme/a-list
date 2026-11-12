-- A verified IMDb subject can be checked even when a provider omits the display year.
create or replace function public.a_list_report_lookup_candidates(p_limit integer default 8) returns setof public.a_list_movies
 language sql stable security invoker set search_path='' as $$
 select m.* from public.a_list_movies m
 where m.report_lookup_after<=now() and m.movie->>'mediaType' is distinct from 'series'
  and (a_list_private.verified_identity(m.movie) is not null or (m.id~'^[0-9]{1,8}$' and m.movie->>'source'~'^https://www[.]dvdsreleasedates[.]com/movies/[0-9]{1,8}/'))
  and (not exists(select 1 from jsonb_array_elements(a_list_private.verified_movie(m.movie)->'releases') r where r->>'kind' in ('Digital','PVOD') and r->>'confidence'='listed')
   or not exists(select 1 from jsonb_array_elements(a_list_private.verified_movie(m.movie)->'releases') r where r->>'kind'='Subscription' and r->>'confidence'='listed'))
 order by exists(select 1 from public.a_list_library l where l.movie_id=m.id) desc,m.report_lookup_after,m.id
 limit greatest(1,least(p_limit,16));
$$;
revoke all on function public.a_list_report_lookup_candidates(integer) from public,anon,authenticated;
grant execute on function public.a_list_report_lookup_candidates(integer) to service_role;
