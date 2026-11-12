-- Add a bounded next-seven-days summary over the full saved library.
-- Preserve caller RLS, existing filters, calendar preferences and pagination.
create or replace function public.a_list_library_page(p_sort text default 'release',p_filter text default 'all',p_offset integer default 0,p_limit integer default 25,p_tracked boolean default false)
 returns jsonb language sql stable security invoker set search_path='' as $$
 with base as materialized (
  select l.movie_id,l.tracked,l.added_at,a_list_private.verified_movie(coalesce(m.movie,l.movie))||jsonb_build_object('tracked',l.tracked,'addedAt',l.added_at,'saved',true) as movie
  from public.a_list_library l left join public.a_list_movies m on m.id=l.movie_id
  where l.user_id=(select auth.uid())
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
    min(r->>'date') filter(where r->>'date'>=to_char(now() at time zone 'America/New_York','YYYY-MM-DD')) as future_date,
    bool_or(r->>'date'<=to_char(now() at time zone 'America/New_York','YYYY-MM-DD') and r->>'confidence'<>'rumored') as available,
    bool_or(r->>'confidence'='rumored') as rumored,
    case p_filter
     when 'soon' then min(r->>'date') filter(where r->>'date'>=to_char(now() at time zone 'America/New_York','YYYY-MM-DD'))
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
  where d.calendar_date>=to_char(now() at time zone 'America/New_York','YYYY-MM-DD')
   and d.calendar_date<to_char((now() at time zone 'America/New_York')+interval '7 days','YYYY-MM-DD')
  order by d.calendar_date,lower(d.movie->>'title') collate "C",d.movie_id collate "C" limit 3
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
   case when p_sort not in ('title','added','theatrical') and p_filter='available' then view_date end desc nulls last,
   case when p_sort not in ('title','added','theatrical') then view_date end nulls last,
   lower(movie->>'title') collate "C",movie_id collate "C"
  limit greatest(1,least(p_limit,50)) offset greatest(0,least(p_offset,100000))
 )
 select jsonb_build_object('movies',coalesce((select jsonb_agg(movie) from page),'[]'::jsonb),
  'total',(select count(*) from base),'filteredTotal',(select count(*) from filtered),
  'trackedCount',(select count(*) from base where tracked),'knownCount',(select count(*) from dated where next_date is not null),
  'listedEvents',(select count(*) from calendar_days where listed),
  'rumoredEvents',(select count(*) from calendar_days where not listed),
  'weekReleases',coalesce((select jsonb_agg(jsonb_build_object('movie',movie,'release',release) order by calendar_date,lower(movie->>'title') collate "C",movie_id collate "C") from weekly),'[]'::jsonb),
  'upcoming',(select movie from dated where calendar_date is not null order by calendar_date,movie_id limit 1),
  'upcomingRelease',(select r from dated b cross join lateral jsonb_array_elements(b.movie->'releases') with ordinality as releases(r,position)
    where b.calendar_date is not null and r->>'date'=b.calendar_date and (r->>'confidence'='listed' or coalesce((select include_rumors from public.a_list_accounts where id=(select auth.uid())),true))
    order by b.calendar_date,b.movie_id,position limit 1));
$$;
revoke all on function public.a_list_library_page(text,text,integer,integer,boolean) from public;
grant execute on function public.a_list_library_page(text,text,integer,integer,boolean) to authenticated;
