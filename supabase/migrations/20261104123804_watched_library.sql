-- Watched state belongs to an account's saved film, never the shared catalogue.
alter table public.a_list_library add column watched_at timestamptz;
create index a_list_library_watched on public.a_list_library(user_id,watched_at desc,movie_id) where watched_at is not null;

create function a_list_private.library_watch_state() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 if new.watched_at is not null then new.tracked=false;
 elsif tg_op='UPDATE' and old.watched_at is not null then new.tracked=true;
 end if;
 return new;
end;
$$;
revoke all on function a_list_private.library_watch_state() from public,anon;
grant execute on function a_list_private.library_watch_state() to authenticated,service_role;
create trigger library_watch_state before insert or update on public.a_list_library
 for each row execute function a_list_private.library_watch_state();

create or replace function public.a_list_library_page(p_sort text default 'release',p_filter text default 'all',p_offset integer default 0,p_limit integer default 25,p_tracked boolean default false)
 returns jsonb language sql stable security invoker set search_path='' as $$
 with raw_base as materialized (
  select l.movie_id,l.tracked,l.added_at,l.watched_at,a_list_private.verified_movie(coalesce(m.movie,l.movie))||jsonb_build_object('tracked',l.tracked,'addedAt',l.added_at,'watchedAt',l.watched_at,'saved',true) as movie
  from public.a_list_library l left join public.a_list_movies m on m.id=l.movie_id
  where l.user_id=(select auth.uid())
 ), base as materialized (
  select b.movie_id,b.tracked,b.added_at,b.watched_at,jsonb_set(b.movie,'{releases}',coalesce((
   select jsonb_agg(r order by position)
   from jsonb_array_elements(b.movie->'releases') with ordinality as releases(r,position)
   where r->>'confidence' in ('listed','rumored')
    and r->>'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and case when pg_input_is_valid(r->>'date','date') then
     to_char((r->>'date')::date,'YYYY-MM-DD')=r->>'date' else false end
  ),'[]'::jsonb)) as movie from raw_base b
 ), calendar_days as (
  select b.movie_id,r->>'date' as release_date,bool_or(r->>'confidence'='listed') as listed
  from base b cross join lateral jsonb_array_elements(b.movie->'releases') r
  where b.tracked and r->>'confidence' in ('listed','rumored')
   and r->>'date' ~ '^\d{4}-\d{2}-\d{2}$'
   and case when pg_input_is_valid(r->>'date','date') then
    to_char((r->>'date')::date,'YYYY-MM-DD')=r->>'date' else false end
  group by b.movie_id,r->>'date'
 ), dated as (
  select b.*,d.next_date,d.future_date,d.available,d.rumored,d.view_date,d.calendar_date from base b
  cross join lateral (
   select coalesce(min(r->>'date') filter(where r->>'date'>=to_char(now() at time zone 'America/New_York','YYYY-MM-DD')),max(r->>'date')) as next_date,
    min(r->>'date') filter(where r->>'date'>to_char(now() at time zone 'America/New_York','YYYY-MM-DD')) as future_date,
    bool_or(r->>'date'<=to_char(now() at time zone 'America/New_York','YYYY-MM-DD') and r->>'confidence'='listed') as available,
    bool_or(r->>'confidence'='rumored') as rumored,
    case p_filter
     when 'soon' then min(r->>'date') filter(where r->>'date'>to_char(now() at time zone 'America/New_York','YYYY-MM-DD'))
     when 'available' then max(r->>'date') filter(where r->>'date'<=to_char(now() at time zone 'America/New_York','YYYY-MM-DD') and r->>'confidence'='listed')
     when 'rumored' then coalesce(min(r->>'date') filter(where r->>'confidence'='rumored' and r->>'date'>=to_char(now() at time zone 'America/New_York','YYYY-MM-DD')),max(r->>'date') filter(where r->>'confidence'='rumored'))
     else coalesce(max(r->>'date') filter(where r->>'date'<=to_char(now() at time zone 'America/New_York','YYYY-MM-DD') and r->>'confidence'='listed'),min(r->>'date') filter(where r->>'date'>=to_char(now() at time zone 'America/New_York','YYYY-MM-DD')),max(r->>'date')) end as view_date,
    min(r->>'date') filter(where r->>'date'>=to_char(now() at time zone 'America/New_York','YYYY-MM-DD') and (r->>'confidence'='listed' or coalesce((select include_rumors from public.a_list_accounts where id=(select auth.uid())),true))) as calendar_date
   from jsonb_array_elements(b.movie->'releases') r
  ) d
 ), weekly as (
  select d.movie_id,d.movie,d.calendar_date,e.release from dated d
  cross join lateral (
   select r as release from jsonb_array_elements(d.movie->'releases') with ordinality as releases(r,position)
   where r->>'date'=d.calendar_date and
    (r->>'confidence'='listed' or coalesce((select include_rumors from public.a_list_accounts where id=(select auth.uid())),true))
   order by (r->>'confidence'='listed') desc,position limit 1
  ) e
  where d.tracked and d.calendar_date>=to_char(now() at time zone 'America/New_York','YYYY-MM-DD')
   and d.calendar_date<to_char((now() at time zone 'America/New_York')+interval '7 days','YYYY-MM-DD')
  order by d.calendar_date,lower(d.movie->>'title') collate "C",d.movie_id collate "C" limit 3
 ), filtered as (
  select * from dated where (not p_tracked or tracked) and (case when p_filter='watched' then watched_at is not null else watched_at is null end) and case p_filter
   when 'soon' then future_date is not null when 'available' then available when 'unknown' then next_date is null
   when 'rumored' then rumored else true end
 ), page as (
  select * from filtered order by
   case when p_sort='title' then lower(movie->>'title') collate "C" end,
   case when p_sort='added' then case when p_filter='watched' then watched_at else added_at end end desc,
   case when p_sort='theatrical' then movie->>'theatrical' end desc nulls last,
   case when p_sort not in ('title','added','theatrical') then case when view_date>=to_char(now() at time zone 'America/New_York','YYYY-MM-DD') then 0 when view_date is not null then 1 else 2 end end,
   case when p_sort not in ('title','added','theatrical') and p_filter='available' then view_date end desc nulls last,
   case when p_sort not in ('title','added','theatrical') then view_date end nulls last,
   lower(movie->>'title') collate "C",movie_id collate "C"
  limit greatest(1,least(p_limit,50)) offset greatest(0,least(p_offset,100000))
 )
 select jsonb_build_object('movies',coalesce((select jsonb_agg(movie) from page),'[]'::jsonb),
  'total',(select count(*) from base),'watchedTotal',(select count(*) from base where watched_at is not null),'filteredTotal',(select count(*) from filtered),
  'trackedCount',(select count(*) from base where tracked),'knownCount',(select count(*) from dated where tracked and next_date is not null),
  'listedEvents',(select count(*) from calendar_days where listed),
  'rumoredEvents',(select count(*) from calendar_days where not listed),
  'weekReleases',coalesce((select jsonb_agg(jsonb_build_object('movie',movie,'release',release) order by calendar_date,lower(movie->>'title') collate "C",movie_id collate "C") from weekly),'[]'::jsonb),
  'upcoming',(select movie from dated where tracked and calendar_date is not null order by calendar_date,movie_id limit 1),
  'upcomingRelease',(select r from dated b cross join lateral jsonb_array_elements(b.movie->'releases') with ordinality as releases(r,position)
    where b.tracked and b.calendar_date is not null and r->>'date'=b.calendar_date and (r->>'confidence'='listed' or coalesce((select include_rumors from public.a_list_accounts where id=(select auth.uid())),true))
    order by b.calendar_date,b.movie_id,(r->>'confidence'='listed') desc,position limit 1));
$$;
revoke all on function public.a_list_library_page(text,text,integer,integer,boolean) from public;
grant execute on function public.a_list_library_page(text,text,integer,integer,boolean) to authenticated;

create or replace function public.a_list_export_library() returns jsonb
 language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'schemaVersion',1,'exportedAt',now(),'releaseRegion','US',
  'settings',jsonb_build_object('includeReportedDates',coalesce((select include_rumors from public.a_list_accounts where id=(select auth.uid())),false)),
  'library',coalesce((select jsonb_agg(jsonb_build_object(
   'movieId',l.movie_id,'title',coalesce(m.movie,l.movie)->>'title','year',coalesce(m.movie,l.movie)->>'year',
   'imdbId',coalesce(m.movie,l.movie)->>'imdbId','savedAt',l.added_at,'watchedAt',l.watched_at,'calendarTracking',l.tracked,
   'releases',a_list_private.verified_movie(coalesce(m.movie,l.movie))->'releases'
  ) order by l.added_at,l.movie_id)
  from public.a_list_library l left join public.a_list_movies m on m.id=l.movie_id
  where l.user_id=(select auth.uid())),'[]'::jsonb)
 );
$$;
revoke all on function public.a_list_export_library() from public,anon;
grant execute on function public.a_list_export_library() to authenticated;

