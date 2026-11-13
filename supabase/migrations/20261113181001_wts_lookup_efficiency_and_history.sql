-- Per-film lookup state is separate from provider-wide last-attempt diagnostics.
alter table public.a_list_movies
 add column report_lookup_failures integer not null default 0 check(report_lookup_failures>=0),
 add column report_lookup_outcome text,
 add column report_lookup_diagnostic jsonb not null default '{}'::jsonb check(jsonb_typeof(report_lookup_diagnostic)='object' and octet_length(report_lookup_diagnostic::text)<2000),
 add column report_lookup_checked_at timestamptz,
 add column report_lookup_success_at timestamptz,
 add column report_lookup_version bigint not null default 0,
 add column report_lookup_known_kinds text[] not null default '{}';
create index a_list_movie_lookup_failures on public.a_list_movies(report_lookup_checked_at,id) where report_lookup_failures>0;
create index a_list_profiles_failures on public.a_list_wts_profiles(check_after,source_id) where failures>0;
create index if not exists a_list_release_candidates_movie_id on public.a_list_release_candidates(movie_id);

create or replace function public.a_list_report_lookup_context(p_id text) returns jsonb
 language sql stable security invoker set search_path='' as $$
 with aliases as materialized (select * from public.a_list_movies where id=p_id or a_list_private.verified_identity(movie)=p_id),
 state as (select * from aliases order by report_lookup_checked_at desc nulls last,id limit 1)
 select jsonb_build_object('saved',exists(select 1 from public.a_list_library where movie_id in(select id from aliases)),
 'misses',coalesce((select max(report_lookup_misses) from aliases),0),
 'failures',coalesce((select max(report_lookup_failures) from aliases),0),
 'lookupVersion',coalesce((select max(report_lookup_version) from aliases),0),
 'nextCheckAt',(select min(report_lookup_after) from aliases),'outcome',(select report_lookup_outcome from state),
 'knownKinds',coalesce((select to_jsonb(report_lookup_known_kinds) from state),'[]'::jsonb),
 'diagnostic',coalesce((select report_lookup_diagnostic from state),'{}'::jsonb),
 'revision',coalesce((select max(p.modified_at)::text from public.a_list_wts_profiles p join public.a_list_release_candidates c using(source_id) where c.approved_imdb_id=p_id),''),
 'profiles',coalesce((select jsonb_agg(jsonb_build_object('source',p.source,'title',p.title)) from public.a_list_wts_profiles p join public.a_list_release_candidates c using(source_id) where c.approved_imdb_id=p_id and c.status='approved'),'[]'::jsonb));
$$;
create function public.a_list_record_lookup_result(p_id text,p_after timestamptz,p_outcome text,p_diagnostic jsonb,p_attempted boolean,p_expected_version bigint,p_source_failure boolean,p_known_kinds text[]) returns boolean
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
 update public.a_list_movies set report_lookup_after=p_after,report_lookup_version=current_version+1,
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
revoke all on function public.a_list_record_lookup_result(text,timestamptz,text,jsonb,boolean,bigint,boolean,text[]) from public,anon,authenticated;
grant execute on function public.a_list_record_lookup_result(text,timestamptz,text,jsonb,boolean,bigint,boolean,text[]) to service_role;

create or replace function a_list_private.reset_changed_profile_lookup() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 if new.modified_at is distinct from old.modified_at then
 update public.a_list_movies m set report_lookup_after=least(report_lookup_after,now()),report_lookup_misses=0,report_lookup_failures=0,report_lookup_outcome=null,report_lookup_version=report_lookup_version+1
 where a_list_private.verified_identity(m.movie)=(select approved_imdb_id from public.a_list_release_candidates where source_id=new.source_id);
 end if;return new;
end;
$$;

-- A dated film release and a TV classification must never enter the same calendar.
create or replace function a_list_private.verified_movie(p_movie jsonb) returns jsonb
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
  where p_movie->>'mediaType' is distinct from 'series' and (r.value->>'sourceName' is distinct from 'When To Stream'
   or r.value->>'filmImdbId'=(select imdb_id from identity))
 ),'[]'::jsonb));
$$;

create or replace function public.a_list_queue_health() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'failureSummary',jsonb_build_object(
 'lookupUnavailable',(select count(distinct coalesce(a_list_private.verified_identity(movie),id)) from public.a_list_movies where report_lookup_failures>0 and movie->>'mediaType' is distinct from 'series'),
 'savedLookupUnavailable',(select count(distinct coalesce(a_list_private.verified_identity(m.movie),m.id)) from public.a_list_movies m where report_lookup_failures>0 and exists(select 1 from public.a_list_library l where l.movie_id=m.id)),
 'profileUnavailable',(select count(*) from public.a_list_wts_profiles where failures>0 and outcome='source_unavailable'),
 'refreshUnavailable',(select count(*) from public.a_list_movies m where refresh_failures>0 and exists(select 1 from jsonb_array_elements(coalesce(m.movie->'releaseCheck'->'issues','[]'::jsonb)) issue where issue->>'provider'='wts')),
 'partialProfiles',(select count(*) from public.a_list_wts_profiles where failures>0 and outcome in('matched','withheld','verified_no_date')),
 'unresolvedLookups',(select count(*) from public.a_list_movies where report_lookup_outcome='unresolved')),
 'lookupUnresolved',coalesce((select jsonb_agg(t) from(select id,movie->>'title' as title,report_lookup_outcome as outcome,report_lookup_diagnostic as diagnostic,report_lookup_after as retryAt,report_lookup_checked_at as checkedAt from public.a_list_movies where report_lookup_outcome='unresolved' order by exists(select 1 from public.a_list_library l where l.movie_id=a_list_movies.id) desc,report_lookup_checked_at desc,id limit 20)t),'[]'::jsonb),
 'lookupFailures',coalesce((select jsonb_agg(t) from(select id,movie->>'title' as title,report_lookup_outcome as outcome,report_lookup_diagnostic as diagnostic,report_lookup_failures as failures,report_lookup_after as retryAt,report_lookup_checked_at as checkedAt from public.a_list_movies where report_lookup_failures>0 order by exists(select 1 from public.a_list_library l where l.movie_id=a_list_movies.id) desc,report_lookup_checked_at desc,id limit 20)t),'[]'::jsonb),
 'announcements',(select jsonb_build_object('due',count(*),'oldestDueAt',min(check_after)) from public.a_list_wts_announcements where check_after<=now() and (last_seen_at>=now()-interval '7 days' or outcome is null or outcome not in('matched','withheld','verified_no_date','not_movie') or coalesce((entry->>'partial')::boolean,false))),
 'profiles',(select jsonb_build_object('due',count(*),'oldestDueAt',min(check_after)) from public.a_list_wts_profiles where check_after<=now()),
 'saved',(select jsonb_build_object('due',count(*),'oldestDueAt',min(refresh_after)) from public.a_list_movies m where refresh_after<=now() and exists(select 1 from public.a_list_library l where l.movie_id=m.id)),
 'lookups',(select jsonb_build_object('due',count(*),'oldestDueAt',min(report_lookup_after)) from public.a_list_movies m where report_lookup_after<=now() and m.movie->>'mediaType' is distinct from 'series' and nullif(m.movie->>'year','') is not null
 and (a_list_private.verified_identity(m.movie) is not null or (m.id~'^[0-9]{1,8}$' and m.movie->>'source'~'^https://www[.]dvdsreleasedates[.]com/movies/[0-9]{1,8}/'))
 and (not exists(select 1 from jsonb_array_elements(a_list_private.verified_movie(m.movie)->'releases') r where r->>'kind' in ('Digital','PVOD') and r->>'confidence'='listed') or not exists(select 1 from jsonb_array_elements(a_list_private.verified_movie(m.movie)->'releases') r where r->>'kind'='Subscription' and r->>'confidence'='listed'))),
 'recentDiagnostics',coalesce((select jsonb_agg(row_to_json(d)) from (select source_id,title,outcome,diagnostic,checked_at,last_success_at,check_after from public.a_list_wts_profiles where diagnostic<>'{}'::jsonb order by checked_at desc limit 20) d),'[]'::jsonb));
$$;
revoke all on function public.a_list_queue_health() from public,anon,authenticated;
grant execute on function public.a_list_queue_health() to service_role;


update public.a_list_movies set report_lookup_after=least(report_lookup_after,now()) where report_lookup_misses=0 and report_lookup_after<now()+interval '11 minutes' and movie->>'mediaType' is distinct from 'series';

-- Public source history is bounded per film and written only for meaningful changes.
create table public.a_list_release_history (
 id bigint generated always as identity primary key,
 movie_id text not null references public.a_list_movies(id) on delete cascade,
 kind text not null check(kind in('Digital','PVOD','Subscription')),
 previous jsonb,
 current jsonb,
 changed_at timestamptz not null default clock_timestamp(),
 reason text not null check(reason in('listed','date_changed','withdrawn','source_changed','confidence_changed','platform_changed')),
 source_revision text
);
create index a_list_release_history_movie on public.a_list_release_history(movie_id,changed_at desc,id desc);
alter table public.a_list_release_history enable row level security;
revoke all on public.a_list_release_history from public,anon,authenticated;
grant select on public.a_list_release_history to authenticated;
grant all on public.a_list_release_history to service_role;
grant usage,select on sequence public.a_list_release_history_id_seq to service_role;
create policy release_history_read on public.a_list_release_history for select to authenticated using(true);

create function a_list_private.release_history_value(r jsonb) returns jsonb language sql immutable set search_path='' as $$
 select case when r is null then null else jsonb_strip_nulls(jsonb_build_object(
 'date',r->>'date','confidence',r->>'confidence','platform',r->>'platform','source',r->>'source','sourceName',r->>'sourceName',
 'checkedAt',r->>'checkedAt','identityMethod',r->>'filmIdentityMethod')) end;
$$;
create function a_list_private.record_release_history() returns trigger language plpgsql security invoker set search_path='' as $$
declare kind_value text; before_value jsonb; after_value jsonb; before_release jsonb; after_release jsonb; why text; revision_value text;
begin
 foreach kind_value in array array['Digital','PVOD','Subscription'] loop
  before_release:=null;
  if tg_op='UPDATE' then select r into before_release from jsonb_array_elements(a_list_private.verified_movie(old.movie)->'releases') r where r->>'kind'=kind_value limit 1; end if;
  select r into after_release from jsonb_array_elements(a_list_private.verified_movie(new.movie)->'releases') r where r->>'kind'=kind_value limit 1;
  before_value:=a_list_private.release_history_value(before_release);after_value:=a_list_private.release_history_value(after_release);
  if (before_value-array['checkedAt','identityMethod']) is not distinct from (after_value-array['checkedAt','identityMethod']) then continue; end if;
  why:=case when before_value is null then 'listed' when after_value is null then 'withdrawn'
   when before_value->>'date' is distinct from after_value->>'date' then 'date_changed'
   when before_value->>'source' is distinct from after_value->>'source' then 'source_changed'
   when before_value->>'confidence' is distinct from after_value->>'confidence' then 'confidence_changed' else 'platform_changed' end;
  select p.modified_at::text into revision_value from public.a_list_wts_profiles p
   where p.source=coalesce(after_release,before_release)->>'source' or p.source=coalesce(after_release,before_release)->>'filmIdentitySource' order by p.modified_at desc limit 1;
  insert into public.a_list_release_history(movie_id,kind,previous,current,reason,source_revision) values(new.id,kind_value,before_value,after_value,why,revision_value);
 end loop;
 delete from public.a_list_release_history h where h.movie_id=new.id and
  (h.changed_at<now()-interval '180 days' or h.id not in(select id from public.a_list_release_history where movie_id=new.id order by changed_at desc,id desc limit 50));
 return null;
end;
$$;
create trigger record_release_history after insert or update of movie on public.a_list_movies for each row execute function a_list_private.record_release_history();
revoke all on function a_list_private.release_history_value(jsonb),a_list_private.record_release_history() from public,anon,authenticated;
grant execute on function a_list_private.release_history_value(jsonb),a_list_private.record_release_history() to service_role;
create function public.a_list_release_history_page(p_id text) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',h.id::text,'kind',h.kind,'previous',h.previous,'current',h.current,'changedAt',h.changed_at,'reason',h.reason,'sourceRevision',h.source_revision) order by h.changed_at desc,h.id desc),'[]'::jsonb)
 from(select h.* from public.a_list_release_history h join public.a_list_movies m on m.id=h.movie_id
 where h.movie_id=p_id and h.changed_at>=now()-interval '180 days' and m.movie->>'mediaType' is distinct from 'series'
 order by h.changed_at desc,h.id desc limit 12) h;
$$;
revoke all on function public.a_list_release_history_page(text) from public,anon;
grant execute on function public.a_list_release_history_page(text) to authenticated,service_role;

alter table public.a_list_wts_profiles add column queued_at timestamptz;
alter table public.a_list_wts_profiles alter column queued_at set default now();
create function a_list_private.profile_revision_queued() returns trigger language plpgsql security invoker set search_path='' as $$
begin if new.modified_at is distinct from old.modified_at then new.queued_at:=clock_timestamp(); end if;return new;end;
$$;
revoke all on function a_list_private.profile_revision_queued() from public,anon,authenticated;
grant execute on function a_list_private.profile_revision_queued() to service_role;
create trigger profile_revision_queued before update of modified_at on public.a_list_wts_profiles for each row execute function a_list_private.profile_revision_queued();

-- Positive movie-only classification or complete verified windows retire obsolete lookup failures.
create function a_list_private.complete_movie_lookup() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (new.movie->>'mediaType'='series' and old.movie->>'mediaType' is distinct from 'series') or
 (a_list_private.calendar_content(new.movie) is distinct from a_list_private.calendar_content(old.movie)
 and exists(select 1 from jsonb_array_elements(a_list_private.verified_movie(new.movie)->'releases') r where r->>'kind' in('Digital','PVOD') and r->>'confidence'='listed')
 and exists(select 1 from jsonb_array_elements(a_list_private.verified_movie(new.movie)->'releases') r where r->>'kind'='Subscription' and r->>'confidence'='listed')) then
 new.report_lookup_failures:=0;new.report_lookup_outcome:='ineligible';new.report_lookup_diagnostic:='{}'::jsonb;
 new.report_lookup_version:=old.report_lookup_version+1;new.report_lookup_after:=greatest(new.report_lookup_after,now()+interval '1 day');
 elsif exists(select 1 from jsonb_array_elements(a_list_private.verified_movie(old.movie)->'releases') r where
  r->>'confidence'='listed' and not exists(select 1 from jsonb_array_elements(a_list_private.verified_movie(new.movie)->'releases') fresh where fresh->>'kind'=r->>'kind' and fresh->>'confidence'='listed')) then
 new.report_lookup_after:=least(new.report_lookup_after,now());new.report_lookup_version:=old.report_lookup_version+1;
 end if;return new;
end;
$$;
revoke all on function a_list_private.complete_movie_lookup() from public,anon,authenticated;
grant execute on function a_list_private.complete_movie_lookup() to service_role;
create trigger complete_movie_lookup before update of movie on public.a_list_movies for each row execute function a_list_private.complete_movie_lookup();

alter table public.a_list_wts_profiles add column published_at timestamptz;

create or replace function public.a_list_queue_wts_announcements(p_entries jsonb) returns void
 language plpgsql security invoker set search_path='' as $$
begin
 if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries)>100 or octet_length(p_entries::text)>2000000 then raise exception 'Invalid announcement queue'; end if;
 if exists(select 1 from jsonb_array_elements(p_entries) e where
  e->'report'->'release'->>'sourceName' is distinct from 'When To Stream'
  or coalesce(e->>'revision','') !~ '^[a-f0-9]{64}$'
  or coalesce(e->'report'->'release'->>'source','') !~ '^https://whentostream[.]com/[a-z0-9-]+/$'
  or coalesce(e->'report'->>'title','')='' or e->'report'->>'inventory'='true') then raise exception 'Invalid announcement subject'; end if;
 insert into public.a_list_wts_announcements as q(source,revision,entry,last_seen_at,check_after,checked_at,outcome)
 select e->'report'->'release'->>'source',e->>'revision',(e-'durable'-'attempts'-'queueVersion')||jsonb_build_object('measureFreshness',coalesce((e->>'measureFreshness')::boolean,e->>'checkedAt' is null)),
  coalesce((e->>'seenAt')::timestamptz,now()),coalesce((e->>'nextCheckAt')::timestamptz,now()),(e->>'checkedAt')::timestamptz,e->>'outcome'
 from jsonb_array_elements(p_entries) e
 on conflict(source) do update set
 last_seen_at=greatest(q.last_seen_at,excluded.last_seen_at),
 entry=case when q.revision=excluded.revision then q.entry else excluded.entry end,
 check_after=case when q.revision=excluded.revision then q.check_after else now() end,
 checked_at=case when q.revision=excluded.revision then q.checked_at else null end,
 outcome=case when q.revision=excluded.revision then q.outcome else null end,
 attempts=case when q.revision=excluded.revision then q.attempts else 0 end,
 version=case when q.revision=excluded.revision then q.version else q.version+1 end,
 revision=excluded.revision
 -- A replayed older snapshot cannot undo a newer RSS observation.
 where excluded.last_seen_at>=q.last_seen_at;
 delete from public.a_list_wts_announcements where last_seen_at<now()-interval '30 days'
 and outcome in('matched','withheld','verified_no_date','not_movie') and not coalesce((entry->>'partial')::boolean,false);
end;
$$;
