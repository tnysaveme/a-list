-- Cross-source reports are visible only after both source identities agree.
-- This helper reads only its JSON argument and preserves existing row security.
create function a_list_private.verified_movie(p_movie jsonb) returns jsonb
 language sql stable security invoker set search_path='' as $$
 with identity as (
  select case
   when p_movie->>'id' ~ '^tt[0-9]{7,10}$' then
    case when nullif(p_movie->>'imdbId','') is null or p_movie->>'imdbId'=p_movie->>'id' then p_movie->>'id' end
   when p_movie->>'imdbId' ~ '^tt[0-9]{7,10}$' then
    case when pg_input_is_valid(coalesce(p_movie->>'identityVerifiedAt',''),'timestamp with time zone') then
     case when isfinite((p_movie->>'identityVerifiedAt')::timestamptz) then p_movie->>'imdbId' end
    end
  end as imdb_id
 )
 select p_movie || jsonb_build_object('releases',coalesce((
  select jsonb_agg(r.value order by r.position)
  from jsonb_array_elements(case when jsonb_typeof(p_movie->'releases')='array' then p_movie->'releases' else '[]'::jsonb end)
   with ordinality as r(value,position)
  where r.value->>'sourceName' is distinct from 'When To Stream'
   or r.value->>'filmImdbId'=(select imdb_id from identity)
 ),'[]'::jsonb));
$$;
revoke all on function a_list_private.verified_movie(jsonb) from public;
grant execute on function a_list_private.verified_movie(jsonb) to authenticated,service_role;

create or replace function public.a_list_library_page(p_sort text default 'release',p_filter text default 'all',p_offset integer default 0,p_limit integer default 25,p_tracked boolean default false)
 returns jsonb language sql stable security invoker set search_path='' as $$
 with base as materialized (
  select l.movie_id,l.tracked,l.added_at,a_list_private.verified_movie(coalesce(m.movie,l.movie))||jsonb_build_object('tracked',l.tracked,'addedAt',l.added_at,'saved',true) as movie
  from public.a_list_library l left join public.a_list_movies m on m.id=l.movie_id
  where l.user_id=(select auth.uid())
 ), dated as (
  select b.*,d.next_date,d.future_date,d.available,d.rumored,d.listed_events,d.rumored_events from base b
  cross join lateral (
   select coalesce(min(r->>'date') filter(where r->>'date'>=to_char(now() at time zone 'America/New_York','YYYY-MM-DD')),max(r->>'date')) as next_date,
    min(r->>'date') filter(where r->>'date'>=to_char(now() at time zone 'America/New_York','YYYY-MM-DD')) as future_date,
    bool_or(r->>'date'<=to_char(now() at time zone 'America/New_York','YYYY-MM-DD') and r->>'confidence'<>'rumored') as available,
    bool_or(r->>'confidence'='rumored') as rumored,
    count(*) filter(where r->>'confidence'<>'rumored') as listed_events,
    count(*) filter(where r->>'confidence'='rumored') as rumored_events
   from jsonb_array_elements(b.movie->'releases') r
  ) d
 ), filtered as (
  select * from dated where (not p_tracked or tracked) and case p_filter
   when 'soon' then future_date is not null when 'available' then available when 'unknown' then next_date is null
   when 'rumored' then rumored else true end
 ), page as (
  select * from filtered order by
   case when p_sort='title' then lower(movie->>'title') end,
   case when p_sort='added' then added_at end desc,
   case when p_sort='theatrical' then movie->>'theatrical' end desc nulls last,
   case when p_sort not in ('title','added','theatrical') then case when future_date is not null then 0 when next_date is not null then 1 else 2 end end,
   case when p_sort not in ('title','added','theatrical') then next_date end nulls last,
   lower(movie->>'title'),movie_id
  limit greatest(1,least(p_limit,50)) offset greatest(0,least(p_offset,100000))
 )
 select jsonb_build_object('movies',coalesce((select jsonb_agg(movie) from page),'[]'::jsonb),
  'total',(select count(*) from base),'filteredTotal',(select count(*) from filtered),
  'trackedCount',(select count(*) from base where tracked),'knownCount',(select count(*) from dated where next_date is not null),
  'listedEvents',(select coalesce(sum(listed_events) filter(where tracked),0) from dated),
  'rumoredEvents',(select coalesce(sum(rumored_events) filter(where tracked),0) from dated),
  'upcoming',(select movie from dated where future_date is not null order by future_date,movie_id limit 1));
$$;
revoke all on function public.a_list_library_page(text,text,integer,integer,boolean) from public;
grant execute on function public.a_list_library_page(text,text,integer,integer,boolean) to authenticated;
