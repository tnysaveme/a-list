-- Saved films get the job's limited time before one-off detail requests.
create or replace function public.a_list_refresh_candidates(p_limit integer default 8) returns setof public.a_list_movies
 language sql stable security invoker set search_path='' as $$
 select m.* from public.a_list_movies m
 where m.refresh_after<=now() and
  (m.requested_at is not null or exists(select 1 from public.a_list_library l where l.movie_id=m.id))
 order by exists(select 1 from public.a_list_library l where l.movie_id=m.id) desc,m.refresh_after,m.id
 limit greatest(1,least(p_limit,8));
$$;
revoke all on function public.a_list_refresh_candidates(integer) from public,anon,authenticated;
grant execute on function public.a_list_refresh_candidates(integer) to service_role;
