-- Rebuildable source inventory and reconciliation diagnostics; no personal data or review workflow.
create table public.a_list_wts_profiles (
 source_id text primary key check(source_id~'^[0-9]{1,10}$'),
 source text not null unique check(source~'^https://whentostream[.]com/[a-z0-9-]+/$'),
 title text not null check(length(title) between 1 and 300),
 film_year text not null check(film_year~'^(18|19|20)[0-9]{2}$'),
 modified_at timestamptz not null,
 checked_at timestamptz,
 check_after timestamptz not null default now(),
 outcome text,
 failures integer not null default 0 check(failures>=0),
 movie_id text,
 audit jsonb not null default '{}'::jsonb check(jsonb_typeof(audit)='object')
);
create index a_list_wts_profiles_due on public.a_list_wts_profiles(check_after,source_id);
alter table public.a_list_wts_profiles enable row level security;
revoke all on public.a_list_wts_profiles from public,anon,authenticated;
grant all on public.a_list_wts_profiles to service_role;
alter table public.a_list_source_status
 add column wts_profile_page integer not null default 1 check(wts_profile_page between 1 and 1000),
 add column wts_profile_after timestamptz not null default now(),
 add column wts_profile_indexed_at timestamptz;

create function public.a_list_queue_wts_profiles(p_profiles jsonb) returns void
 language plpgsql security invoker set search_path='' as $$
begin
 if jsonb_typeof(p_profiles) is distinct from 'array' or jsonb_array_length(p_profiles)>100 or octet_length(p_profiles::text)>200000 then raise exception 'Invalid source inventory'; end if;
 insert into public.a_list_wts_profiles(source_id,source,title,film_year,modified_at)
 select source_id,source,title,film_year,modified_at from jsonb_to_recordset(p_profiles) as profiles(source_id text,source text,title text,film_year text,modified_at timestamptz)
 on conflict(source_id) do update set source=excluded.source,title=excluded.title,film_year=excluded.film_year,modified_at=excluded.modified_at,check_after=least(a_list_wts_profiles.check_after,now())
 where excluded.modified_at>=a_list_wts_profiles.modified_at and
 (excluded.modified_at>a_list_wts_profiles.modified_at or excluded.source<>a_list_wts_profiles.source or excluded.title<>a_list_wts_profiles.title or excluded.film_year<>a_list_wts_profiles.film_year);
end;
$$;
revoke all on function public.a_list_queue_wts_profiles(jsonb) from public,anon,authenticated;
grant execute on function public.a_list_queue_wts_profiles(jsonb) to service_role;

-- Retry old negative matches with the shared profile resolver and the expanded evidence rules.
update public.a_list_movies set report_lookup_after=now();
update public.a_list_source_status set wts_feed_after=now() where id;
