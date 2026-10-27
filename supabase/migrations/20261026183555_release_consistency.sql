-- Keep release ordering and calendar previews consistent with the client selectors.
create or replace function public.a_list_library_page(p_sort text default 'release',p_filter text default 'all',p_offset integer default 0,p_limit integer default 25,p_tracked boolean default false)
 returns jsonb language sql stable security invoker set search_path='' as $$
 with base as materialized (
  select l.movie_id,l.tracked,l.added_at,a_list_private.verified_movie(coalesce(m.movie,l.movie))||jsonb_build_object('tracked',l.tracked,'addedAt',l.added_at,'saved',true) as movie
  from public.a_list_library l left join public.a_list_movies m on m.id=l.movie_id
  where l.user_id=(select auth.uid())
 ), dated as (
  select b.*,d.next_date,d.future_date,d.available,d.rumored,d.listed_events,d.rumored_events,d.view_date,d.calendar_date from base b
  cross join lateral (
   select coalesce(min(r->>'date') filter(where r->>'date'>=to_char(now() at time zone 'America/New_York','YYYY-MM-DD')),max(r->>'date')) as next_date,
    min(r->>'date') filter(where r->>'date'>=to_char(now() at time zone 'America/New_York','YYYY-MM-DD')) as future_date,
    bool_or(r->>'date'<=to_char(now() at time zone 'America/New_York','YYYY-MM-DD') and r->>'confidence'<>'rumored') as available,
    bool_or(r->>'confidence'='rumored') as rumored,
    count(*) filter(where r->>'confidence'<>'rumored') as listed_events,
    count(*) filter(where r->>'confidence'='rumored') as rumored_events,
    case p_filter
     when 'soon' then min(r->>'date') filter(where r->>'date'>=to_char(now() at time zone 'America/New_York','YYYY-MM-DD'))
     when 'available' then max(r->>'date') filter(where r->>'date'<=to_char(now() at time zone 'America/New_York','YYYY-MM-DD') and r->>'confidence'='listed')
     when 'rumored' then coalesce(min(r->>'date') filter(where r->>'confidence'='rumored' and r->>'date'>=to_char(now() at time zone 'America/New_York','YYYY-MM-DD')),max(r->>'date') filter(where r->>'confidence'='rumored'))
     else coalesce(max(r->>'date') filter(where r->>'date'<=to_char(now() at time zone 'America/New_York','YYYY-MM-DD') and r->>'confidence'='listed'),min(r->>'date') filter(where r->>'date'>=to_char(now() at time zone 'America/New_York','YYYY-MM-DD')),max(r->>'date')) end as view_date,
    min(r->>'date') filter(where r->>'date'>=to_char(now() at time zone 'America/New_York','YYYY-MM-DD') and (r->>'confidence'='listed' or coalesce((select include_rumors from public.a_list_accounts where id=(select auth.uid())),true))) as calendar_date
   from jsonb_array_elements(b.movie->'releases') r
  ) d
 ), filtered as (
  select * from dated where (not p_tracked or tracked) and case p_filter
   when 'soon' then future_date is not null when 'available' then available when 'unknown' then next_date is null
   when 'rumored' then rumored else true end
 ), page as (
  select * from filtered order by
   case when p_sort='title' then lower(movie->>'title') collate "C" end,
   case when p_sort='added' then added_at end desc,
   case when p_sort='theatrical' then movie->>'theatrical' end desc nulls last,
   case when p_sort not in ('title','added','theatrical') then case when view_date>=to_char(now() at time zone 'America/New_York','YYYY-MM-DD') then 0 when view_date is not null then 1 else 2 end end,
   case when p_sort not in ('title','added','theatrical') then view_date end nulls last,
   lower(movie->>'title') collate "C",movie_id collate "C"
  limit greatest(1,least(p_limit,50)) offset greatest(0,least(p_offset,100000))
 )
 select jsonb_build_object('movies',coalesce((select jsonb_agg(movie) from page),'[]'::jsonb),
  'total',(select count(*) from base),'filteredTotal',(select count(*) from filtered),
  'trackedCount',(select count(*) from base where tracked),'knownCount',(select count(*) from dated where next_date is not null),
  'listedEvents',(select coalesce(sum(listed_events) filter(where tracked),0) from dated),
  'rumoredEvents',(select coalesce(sum(rumored_events) filter(where tracked),0) from dated),
  'upcoming',(select movie from dated where calendar_date is not null order by calendar_date,movie_id limit 1),
  'upcomingRelease',(select r from dated b cross join lateral jsonb_array_elements(b.movie->'releases') with ordinality as releases(r,position)
    where b.calendar_date is not null and r->>'date'=b.calendar_date and (r->>'confidence'='listed' or coalesce((select include_rumors from public.a_list_accounts where id=(select auth.uid())),true))
    order by b.calendar_date,b.movie_id,position limit 1));
$$;
revoke all on function public.a_list_library_page(text,text,integer,integer,boolean) from public;
grant execute on function public.a_list_library_page(text,text,integer,integer,boolean) to authenticated;

-- Explicit per-window withdrawals are service-only and use the same row version guard as publication.
create function public.a_list_withdraw_release_windows(p_movie_id text,p_imdb_id text,p_source text,p_kinds text[],p_version timestamptz)
returns void language plpgsql security invoker set search_path='' as $$
declare current_movie public.a_list_movies%rowtype; movie_value jsonb;
begin
 if p_movie_id is null or p_imdb_id is null or p_source is null or p_kinds is null or array_position(p_kinds,null) is not null or p_version is null or p_imdb_id !~ '^tt[0-9]{7,10}$' or p_source !~ '^https://whentostream[.]com/[a-z0-9-]+/$' or cardinality(p_kinds) not between 1 and 3 or not p_kinds <@ array['Digital','PVOD','Subscription'] then raise exception 'Invalid release withdrawal'; end if;
 select * into current_movie from public.a_list_movies where id=p_movie_id for update;
 if not found or current_movie.updated_at is distinct from p_version then raise exception 'Catalogue changed; retry'; end if;
 if coalesce(current_movie.movie->>'imdbId',current_movie.id) is distinct from p_imdb_id then raise exception 'Conflicting movie identity'; end if;
 select jsonb_set(current_movie.movie,'{releases}',coalesce(jsonb_agg(r order by position) filter(where not coalesce((r->>'source'=p_source and r->>'kind'=any(p_kinds) and r->>'filmImdbId'=p_imdb_id),false)),'[]'::jsonb)) into movie_value
 from jsonb_array_elements(current_movie.movie->'releases') with ordinality as releases(r,position);
 update public.a_list_movies set movie=movie_value,updated_at=clock_timestamp() where id=p_movie_id;
 update public.a_list_source_status set catalogue=coalesce((select jsonb_agg(case when m->>'id'=p_movie_id then movie_value else m end) from jsonb_array_elements(catalogue) m),'[]'::jsonb),version=gen_random_uuid()::text,updated_at=clock_timestamp() where id;
end;
$$;
revoke all on function public.a_list_withdraw_release_windows(text,text,text,text[],timestamptz) from public,anon,authenticated;
grant execute on function public.a_list_withdraw_release_windows(text,text,text,text[],timestamptz) to service_role;
