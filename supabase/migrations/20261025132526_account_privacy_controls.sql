-- Each privacy operation derives its owner from the verified database identity.
-- No administrative key or caller-supplied user ID is accepted by these RPCs.
create function public.a_list_export_library() returns jsonb
 language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'schemaVersion',1,'exportedAt',now(),'releaseRegion','US',
  'settings',jsonb_build_object('includeReportedDates',coalesce((select include_rumors from public.a_list_accounts where id=(select auth.uid())),false)),
  'library',coalesce((select jsonb_agg(jsonb_build_object(
   'movieId',l.movie_id,'title',coalesce(m.movie,l.movie)->>'title','year',coalesce(m.movie,l.movie)->>'year',
   'imdbId',coalesce(m.movie,l.movie)->>'imdbId','savedAt',l.added_at,'calendarTracking',l.tracked,
   'releases',a_list_private.verified_movie(coalesce(m.movie,l.movie))->'releases'
  ) order by l.added_at,l.movie_id)
  from public.a_list_library l left join public.a_list_movies m on m.id=l.movie_id
  where l.user_id=(select auth.uid())),'[]'::jsonb)
 );
$$;
revoke all on function public.a_list_export_library() from public,anon;
grant execute on function public.a_list_export_library() to authenticated;

create function public.a_list_rotate_calendar() returns text
 language plpgsql security invoker set search_path='' as $$
declare token text;
begin
 update public.a_list_accounts set feed_token=gen_random_uuid()::text||replace(gen_random_uuid()::text,'-','')
 where id=(select auth.uid()) returning feed_token into token;
 -- The existing settings trigger advances the revision; readers authorize before cache access.
 return token;
end;
$$;
revoke all on function public.a_list_rotate_calendar() from public,anon;
grant execute on function public.a_list_rotate_calendar() to authenticated;
