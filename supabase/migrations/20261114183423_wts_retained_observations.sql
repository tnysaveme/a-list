-- Bounded operational aggregates only: no identities, URLs, queries or account data.
create table public.a_list_observation_days (
 day date not null,
 generation uuid not null,
 version bigint not null check(version>0),
 fields jsonb not null check(jsonb_typeof(fields)='object' and octet_length(fields::text)<60000),
 observed_at timestamptz not null default clock_timestamp(),
 primary key(day,generation)
);
alter table public.a_list_observation_days enable row level security;
revoke all on public.a_list_observation_days from public,anon,authenticated;
grant all on public.a_list_observation_days to service_role;
create policy observations_service on public.a_list_observation_days to service_role using(true) with check(true);

create table public.a_list_wts_health_history (
 hour timestamptz primary key,
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<20000)
);
alter table public.a_list_wts_health_history enable row level security;
revoke all on public.a_list_wts_health_history from public,anon,authenticated;
grant all on public.a_list_wts_health_history to service_role;
create policy health_history_service on public.a_list_wts_health_history to service_role using(true) with check(true);

create function public.a_list_retain_observations(p_day date,p_generation uuid,p_version bigint,p_fields jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
declare k text; v jsonb; changed integer;
begin
 if p_day is null or p_day<(now() at time zone 'UTC')::date-3 or p_day>(now() at time zone 'UTC')::date or p_generation is null or p_version is null or p_version<1
 or jsonb_typeof(p_fields) is distinct from 'object' or octet_length(p_fields::text)>60000 then raise exception 'Invalid observation'; end if;
 if (select count(*) from jsonb_object_keys(p_fields))>400 then raise exception 'Too many observation fields'; end if;
 for k,v in select * from jsonb_each(p_fields) loop
  if k !~ '^(count:(api_requests|api_errors|throttled|sign_in_emails|catalogue_preview_unavailable|feed_cache_hit|feed_cache_miss|refresh_jobs|refresh_failures|source_failures|refreshed_movies)|time:(visitor_movie|visitor_catalogue|visitor_library|visitor_search|visitor_release_history|background_detail_poll|lookup_source|lookup_cached|discovered_to_published|source_modified_to_published|refresh_job):([0-9]|1[0-9]|2[0-5]))$'
  or jsonb_typeof(v)<>'number' or v::text!~'^[0-9]+$' then raise exception 'Invalid observation field'; end if;
  if v::numeric>9007199254740991 then raise exception 'Observation overflow'; end if;
 end loop;
 insert into public.a_list_observation_days as d(day,generation,version,fields) values(p_day,p_generation,p_version,p_fields)
 on conflict(day,generation) do update set version=excluded.version,fields=excluded.fields,observed_at=clock_timestamp() where excluded.version>d.version;
 get diagnostics changed=row_count;
 delete from public.a_list_observation_days where day<(now() at time zone 'UTC')::date-44;
 return changed>0;
end;
$$;
revoke all on function public.a_list_retain_observations(date,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.a_list_retain_observations(date,uuid,bigint,jsonb) to service_role;

create function public.a_list_capture_wts_health() returns boolean
language plpgsql security invoker set search_path='' as $$
declare stamp timestamptz:=date_trunc('hour',now()); q jsonb; s jsonb; outcomes jsonb;
begin
 if exists(select 1 from public.a_list_wts_health_history where hour=stamp) then return false; end if;
 q:=public.a_list_queue_health();
 select jsonb_build_object('lastSuccessAt',last_success_at,'failures',failures,'auditCheckedAt',wts_coverage->>'checkedAt','unexplained',wts_coverage->'unexplained','discoveryCheckedAt',wts_profile_changes->>'checkedAt','discoveryThrough',wts_profile_changes->>'through','indexedAt',wts_profile_indexed_at) into s from public.a_list_source_status where id;
 select coalesce(jsonb_object_agg(coalesce(outcome,'unchecked'),n),'{}'::jsonb) into outcomes from(select outcome,count(*) n from public.a_list_wts_profiles group by outcome)t;
 insert into public.a_list_wts_health_history(hour,snapshot) values(stamp,jsonb_build_object(
 'failureSummary',q->'failureSummary','queues',jsonb_build_object('profiles',q->'profiles','announcements',q->'announcements','saved',q->'saved','lookups',q->'lookups'),
 'profiles',outcomes,'source',s)) on conflict(hour) do nothing;
 delete from public.a_list_wts_health_history where hour<date_trunc('hour',now())-interval '45 days';
 return true;
end;
$$;
revoke all on function public.a_list_capture_wts_health() from public,anon,authenticated;
grant execute on function public.a_list_capture_wts_health() to service_role;

-- Cached observations may defer work but cannot invalidate an active source writer.
create or replace function public.a_list_record_lookup_result(p_id text,p_after timestamptz,p_outcome text,p_diagnostic jsonb,p_attempted boolean,p_expected_version bigint,p_source_failure boolean,p_known_kinds text[]) returns boolean
 language plpgsql security invoker set search_path='' as $$
declare identity_id text; current_version bigint; stamp timestamptz:=clock_timestamp();
begin
 if p_id is null or p_id!~'^([0-9]{1,8}|tt[0-9]{7,10})$' or p_after is null or p_after<now()-interval '1 minute' or p_after>now()+interval '8 days'
 or p_outcome is null or p_outcome not in('ineligible','cached','busy','matched','no_report','unresolved','source_unavailable')
 or jsonb_typeof(p_diagnostic) is distinct from 'object' or octet_length(p_diagnostic::text)>2000
 or p_diagnostic-array['stage','category','durationMs','status','provider']<>'{}'::jsonb
 or (p_diagnostic ? 'stage' and p_diagnostic->>'stage' not in('profile','identity','database','publication'))
 or (p_diagnostic ? 'category' and p_diagnostic->>'category' not in('timeout','http_error','format_changed','identity_conflict','not_listed','unavailable','budget_exhausted','version_conflict','database_unavailable','insufficient_evidence','ambiguous_identity'))
 or (p_diagnostic ? 'provider' and p_diagnostic->>'provider' not in('primary','metadata','wts'))
 or array_position(p_known_kinds,null) is not null
 or p_attempted is null or p_source_failure is null or p_known_kinds is null or not p_known_kinds<@array['Digital','PVOD','Subscription'] then raise exception 'Invalid lookup result'; end if;
 select a_list_private.verified_identity(movie) into identity_id from public.a_list_movies where id=p_id;
 perform pg_advisory_xact_lock(hashtext('a_list_lookup:'||coalesce(identity_id,p_id)));
 perform 1 from public.a_list_movies where id=p_id or (identity_id is not null and a_list_private.verified_identity(movie)=identity_id) order by id for update;
 select max(report_lookup_version) into current_version from public.a_list_movies where id=p_id or (identity_id is not null and a_list_private.verified_identity(movie)=identity_id);
 if current_version is null or current_version is distinct from p_expected_version then return false; end if;
 update public.a_list_movies set report_lookup_after=p_after,report_lookup_version=case when p_attempted then current_version+1 else current_version end,
 report_lookup_known_kinds=case when p_attempted then p_known_kinds else report_lookup_known_kinds end,
 report_lookup_outcome=case when p_attempted then p_outcome else report_lookup_outcome end,
 report_lookup_checked_at=case when p_attempted then stamp else report_lookup_checked_at end,
 report_lookup_success_at=case when p_attempted and p_outcome in('matched','no_report','ineligible') then stamp else report_lookup_success_at end,
 report_lookup_diagnostic=case when p_attempted then p_diagnostic else report_lookup_diagnostic end,
 report_lookup_failures=case when not p_attempted then report_lookup_failures when p_source_failure then report_lookup_failures+1 when p_outcome in('matched','no_report','ineligible','unresolved') then 0 else report_lookup_failures end,
 report_lookup_misses=case when not p_attempted then report_lookup_misses when p_outcome in('no_report','unresolved') then least(report_lookup_misses+1,8) when p_outcome in('matched','ineligible') then 0 else report_lookup_misses end
 where id=p_id or (identity_id is not null and a_list_private.verified_identity(movie)=identity_id);
 return true;
end;
$$;
