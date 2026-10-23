create table public.a_list_movies (
 id text primary key check (id ~ '^[0-9]{1,8}$'),
 movie jsonb not null check (jsonb_typeof(movie) = 'object' and movie->>'id' = id),
 refresh_after timestamptz not null default now(),
 requested_at timestamptz,
 refresh_failures integer not null default 0,
 updated_at timestamptz not null default now()
);
create index a_list_movies_refresh on public.a_list_movies(refresh_after);
create index a_list_library_movie on public.a_list_library(movie_id);
create index a_list_library_added on public.a_list_library(user_id, added_at desc, movie_id);
create table public.a_list_source_status (
 id boolean primary key default true check (id),
 version text not null default gen_random_uuid()::text,
 catalogue jsonb not null default '[]'::jsonb,
 catalogue_success_at timestamptz,
 last_attempt_at timestamptz,
 last_success_at timestamptz,
 last_failure_at timestamptz,
 failures integer not null default 0,
 updated_at timestamptz not null default now()
);
insert into public.a_list_source_status(id) values(true);
alter table public.a_list_movies enable row level security;
alter table public.a_list_source_status enable row level security;
revoke all on public.a_list_movies, public.a_list_source_status from public, anon, authenticated;
grant select on public.a_list_movies, public.a_list_source_status to authenticated;
grant all on public.a_list_movies, public.a_list_source_status to service_role;
create policy signed_in_movies on public.a_list_movies for select to authenticated using (true);
create policy signed_in_source_status on public.a_list_source_status for select to authenticated using (true);

insert into public.a_list_movies(id,movie)
 select distinct on (movie_id) movie_id, movie from public.a_list_library order by movie_id, added_at desc
 on conflict do nothing;

alter table public.a_list_accounts add column calendar_revision bigint not null default 0;
alter table public.a_list_accounts add column calendar_updated_at timestamptz not null default now();
create function a_list_private.library_changed() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 update public.a_list_accounts set calendar_revision=calendar_revision+1,calendar_updated_at=clock_timestamp()
 where id=coalesce(new.user_id,old.user_id);
 return coalesce(new,old);
end;
$$;
revoke all on function a_list_private.library_changed() from public;
grant execute on function a_list_private.library_changed() to authenticated,service_role;
create trigger library_changed after insert or update or delete on public.a_list_library
 for each row execute function a_list_private.library_changed();
create function a_list_private.calendar_settings_changed() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.include_rumors is distinct from old.include_rumors or new.feed_token is distinct from old.feed_token then
  new.calendar_revision=old.calendar_revision+1; new.calendar_updated_at=clock_timestamp();
 end if;
 return new;
end;
$$;
revoke all on function a_list_private.calendar_settings_changed() from public;
grant execute on function a_list_private.calendar_settings_changed() to authenticated,service_role;
create trigger calendar_settings_changed before update on public.a_list_accounts
 for each row execute function a_list_private.calendar_settings_changed();

create function a_list_private.calendar_state(p_token text) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
declare a public.a_list_accounts%rowtype; s public.a_list_source_status%rowtype;
begin
 if p_token is null or p_token !~ '^[a-f0-9-]{68}$' then return null; end if;
 select * into a from public.a_list_accounts where feed_token=p_token;
 if not found or (auth.uid() is not null and auth.uid()<>a.id) then return null; end if;
 select * into s from public.a_list_source_status where id;
 return jsonb_build_object('revision',a.calendar_revision::text,'sourcesVersion',s.version,
  'modifiedAt',greatest(a.calendar_updated_at,s.updated_at),'includeRumors',a.include_rumors);
end;
$$;
revoke all on function a_list_private.calendar_state(text) from public;
grant execute on function a_list_private.calendar_state(text) to anon,authenticated;
create function public.a_list_calendar_state(p_token text) returns jsonb
 language sql stable security invoker set search_path='' as $$ select a_list_private.calendar_state(p_token); $$;
revoke all on function public.a_list_calendar_state(text) from public;
grant execute on function public.a_list_calendar_state(text) to anon,authenticated;

create or replace function a_list_private.read_calendar(p_token text) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
declare a public.a_list_accounts%rowtype;
begin
 if p_token is null or p_token !~ '^[a-f0-9-]{68}$' then return null; end if;
 select * into a from public.a_list_accounts where feed_token=p_token;
 if not found or (auth.uid() is not null and auth.uid()<>a.id) then return null; end if;
 return jsonb_build_object('includeRumors',a.include_rumors,'movies',coalesce((
  select jsonb_agg(coalesce(m.movie,l.movie) order by l.movie_id)
  from public.a_list_library l left join public.a_list_movies m on m.id=l.movie_id
  where l.user_id=a.id and l.tracked),'[]'::jsonb));
end;
$$;

create function public.a_list_library_page(p_sort text default 'release',p_filter text default 'all',p_offset integer default 0,p_limit integer default 25,p_tracked boolean default false)
 returns jsonb language sql stable security invoker set search_path='' as $$
 with base as (
  select l.movie_id,l.tracked,l.added_at,coalesce(m.movie,l.movie)||jsonb_build_object('tracked',l.tracked,'addedAt',l.added_at,'saved',true) as movie
  from public.a_list_library l left join public.a_list_movies m on m.id=l.movie_id
  where l.user_id=(select auth.uid())
 ), dated as (
  select b.*,d.next_date,d.future_date,d.available,d.rumored from base b
  cross join lateral (
   select coalesce(min(r->>'date') filter(where r->>'date'>=to_char(now() at time zone 'America/New_York','YYYY-MM-DD')),max(r->>'date')) as next_date,
    min(r->>'date') filter(where r->>'date'>=to_char(now() at time zone 'America/New_York','YYYY-MM-DD')) as future_date,
    bool_or(r->>'date'<=to_char(now() at time zone 'America/New_York','YYYY-MM-DD') and r->>'confidence'<>'rumored') as available,
    bool_or(r->>'confidence'='rumored') as rumored
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
  'listedEvents',(select count(*) from base b cross join lateral jsonb_array_elements(b.movie->'releases') r where b.tracked and r->>'confidence'<>'rumored'),
  'rumoredEvents',(select count(*) from base b cross join lateral jsonb_array_elements(b.movie->'releases') r where b.tracked and r->>'confidence'='rumored'),
  'upcoming',(select movie from dated where future_date is not null order by future_date,movie_id limit 1));
$$;
revoke all on function public.a_list_library_page(text,text,integer,integer,boolean) from public;
grant execute on function public.a_list_library_page(text,text,integer,integer,boolean) to authenticated;

create function public.a_list_refresh_candidates(p_limit integer default 8) returns setof public.a_list_movies
 language sql stable security invoker set search_path='' as $$
 select m.* from public.a_list_movies m where refresh_after<=now() and
 (requested_at is not null or exists(select 1 from public.a_list_library l where l.movie_id=m.id))
 order by refresh_after,m.id limit greatest(1,least(p_limit,8));
$$;
revoke all on function public.a_list_refresh_candidates(integer) from public;
grant execute on function public.a_list_refresh_candidates(integer) to service_role;

create function public.a_list_publish_catalogue(p_movies jsonb,p_checked_at timestamptz) returns void
 language plpgsql security invoker set search_path='' as $$
begin
 insert into public.a_list_movies(id,movie,updated_at)
 select m->>'id',m,p_checked_at from jsonb_array_elements(p_movies) m
 on conflict(id) do update set movie=excluded.movie,updated_at=excluded.updated_at;
 update public.a_list_source_status set catalogue=p_movies,catalogue_success_at=p_checked_at where id;
end;
$$;
revoke all on function public.a_list_publish_catalogue(jsonb,timestamptz) from public;
grant execute on function public.a_list_publish_catalogue(jsonb,timestamptz) to service_role;
