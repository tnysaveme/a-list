-- Rebuildable public-source work; never include personal data or browser access.
create table public.a_list_wts_announcements (
 source text primary key check(source ~ '^https://whentostream[.]com/[a-z0-9-]+/$'),
 revision text not null check(revision ~ '^[a-f0-9]{64}$'),
 entry jsonb not null check(jsonb_typeof(entry)='object' and octet_length(entry::text)<=100000),
 last_seen_at timestamptz not null default now(),
 check_after timestamptz not null default now(),
 checked_at timestamptz,
 outcome text,
 version integer not null default 0 check(version>=0),
 attempts integer not null default 0 check(attempts>=0)
);
create index a_list_wts_announcements_due on public.a_list_wts_announcements(check_after,source);
alter table public.a_list_wts_announcements enable row level security;
revoke all on public.a_list_wts_announcements from public,anon,authenticated;
grant all on public.a_list_wts_announcements to service_role;

create function public.a_list_queue_wts_announcements(p_entries jsonb) returns void
 language plpgsql security invoker set search_path='' as $$
begin
 if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries)>100 or octet_length(p_entries::text)>2000000 then raise exception 'Invalid announcement queue'; end if;
 if exists(select 1 from jsonb_array_elements(p_entries) e where
  e->'report'->'release'->>'sourceName' is distinct from 'When To Stream'
  or coalesce(e->>'revision','') !~ '^[a-f0-9]{64}$'
  or coalesce(e->'report'->'release'->>'source','') !~ '^https://whentostream[.]com/[a-z0-9-]+/$'
  or coalesce(e->'report'->>'title','')='' or e->'report'->>'inventory'='true') then raise exception 'Invalid announcement subject'; end if;
 insert into public.a_list_wts_announcements as q(source,revision,entry,last_seen_at,check_after,checked_at,outcome)
 select e->'report'->'release'->>'source',e->>'revision',e-'durable'-'attempts'-'queueVersion',
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
create function public.a_list_due_wts_announcements(p_limit integer default 4) returns setof jsonb
 language sql stable security invoker set search_path='' as $$
 select entry||jsonb_build_object('durable',true,'queueVersion',version,'attempts',attempts,'dueAt',check_after,'checkedAt',checked_at,'nextCheckAt',check_after)
 from public.a_list_wts_announcements
 where check_after<=now() and (last_seen_at>=now()-interval '7 days' or outcome is null
 or outcome not in('matched','withheld','verified_no_date','not_movie') or coalesce((entry->>'partial')::boolean,false))
 order by check_after,source limit greatest(1,least(p_limit,16));
$$;
create function public.a_list_checkpoint_wts_announcements(p_entries jsonb) returns void
 language plpgsql security invoker set search_path='' as $$
begin
 if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries)>16 then raise exception 'Invalid announcement checkpoint'; end if;
 update public.a_list_wts_announcements q set
 entry=e-'durable'-'attempts'-'queueVersion',version=q.version+1,checked_at=now(),outcome=e->>'outcome',attempts=case when
 e->>'outcome' in('matched','withheld','verified_no_date','not_movie') and not coalesce((e->>'partial')::boolean,false) then 0 else q.attempts+1 end,
 check_after=case when e->>'outcome' in('matched','withheld','verified_no_date','not_movie') and not coalesce((e->>'partial')::boolean,false)
 then now()+interval '6 hours'
 when e->>'outcome'='source_unavailable' or coalesce((e->>'partial')::boolean,false)
 then now()+least(interval '24 hours',interval '15 minutes'*power(2,least(q.attempts,7)))
 else now()+least(interval '7 days',interval '1 day'*power(2,least(q.attempts,3))) end
 from jsonb_array_elements(p_entries) e
 where q.source=e->'report'->'release'->>'source' and q.revision=e->>'revision'
 and q.version=(e->>'queueVersion')::integer and q.attempts=coalesce((e->>'attempts')::integer,0) and e->>'checkedAt' is not null;
end;
$$;
revoke all on function public.a_list_queue_wts_announcements(jsonb),public.a_list_due_wts_announcements(integer),public.a_list_checkpoint_wts_announcements(jsonb) from public,anon,authenticated;
grant execute on function public.a_list_queue_wts_announcements(jsonb),public.a_list_due_wts_announcements(integer),public.a_list_checkpoint_wts_announcements(jsonb) to service_role;
-- Preserve every entry available at rollout, including unresolved work older than the recent feed.
select public.a_list_queue_wts_announcements(wts_feed) from public.a_list_source_status;

create or replace function public.a_list_due_wts_profiles(p_limit integer default 4) returns setof jsonb
 language sql stable security invoker set search_path='' as $$
 select to_jsonb(p)||jsonb_build_object('saved',s.saved)
 from public.a_list_wts_profiles p
 cross join lateral(select exists(select 1 from public.a_list_library l where l.movie_id=p.movie_id
  or exists(select 1 from public.a_list_release_candidates c where c.source_id=p.source_id and c.movie_id=l.movie_id)) as saved) s
 where p.check_after<=now()
 order by case when p.priority=2 then 0 when p.check_after<now()-interval '1 day' then 1 when s.saved then 2 when p.priority=1 or p.checked_at is null then 3 else 4 end,
 p.check_after,p.modified_at desc,p.source_id
 limit greatest(1,least(p_limit,16));
$$;
revoke all on function public.a_list_due_wts_profiles(integer) from public,anon,authenticated;
grant execute on function public.a_list_due_wts_profiles(integer) to service_role;


create or replace function public.a_list_queue_health() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
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

-- Preserve provenance on aliases without replacing their preferred primary window.
create function a_list_private.release_conflict(preferred jsonb,report jsonb) returns jsonb
 language sql immutable security invoker set search_path='' as $$
 select (preferred-'conflictingRelease') || case when report->>'confidence'='listed' and preferred->>'date'<>report->>'date'
 then jsonb_build_object('conflictingRelease',report-'conflictingRelease') else '{}'::jsonb end;
$$;
revoke all on function a_list_private.release_conflict(jsonb,jsonb) from public,anon,authenticated;
grant execute on function a_list_private.release_conflict(jsonb,jsonb) to service_role;

create or replace function public.a_list_store_release_match(p_match jsonb default null,p_movie jsonb default null,p_version timestamptz default null,p_reports jsonb default null)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare previous public.a_list_release_candidates%rowtype; current_movie public.a_list_movies%rowtype;
 source_id text:=p_match->>'source_id'; movie_id text:=p_movie->>'id'; imdb_id text:=p_movie->>'imdbId';
 stamp timestamptz:=clock_timestamp(); changed integer:=0; matched boolean:=p_movie is not null;
begin
 perform pg_advisory_xact_lock(hashtext('a_list_release_review'));
 if p_match is not null then
  if coalesce(source_id,'') !~ '^[0-9]{1,10}$' or p_match->'profile'->>'sourceFilmId' is distinct from source_id
   or coalesce(p_match->'profile'->>'sourceFilmUrl','') !~ '^https://whentostream[.]com/[a-z0-9-]+/$'
   or coalesce(p_match->>'fingerprint','') !~ '^[a-f0-9]{64}$' or coalesce(p_match->>'method','') not in ('reviewed','structured','corroborated')
   or coalesce(p_match->>'status','') not in ('approved','pending') or octet_length(p_match::text)>100000 then raise exception 'Invalid source match'; end if;
  select * into previous from public.a_list_release_candidates c where c.source_id=p_match->>'source_id' for update;
  if previous.status='approved' and not matched and (previous.fingerprint<>p_match->>'fingerprint' or p_match->>'status'='pending') then
   update public.a_list_movies m set movie=jsonb_set(m.movie,'{releases}',coalesce((
    select jsonb_agg(r) from jsonb_array_elements(m.movie->'releases') r where r->>'filmIdentitySource' is distinct from previous.profile->>'sourceFilmUrl'
   ),'[]'::jsonb)),updated_at=stamp where m.id=previous.movie_id or a_list_private.verified_identity(m.movie)=previous.approved_imdb_id;
   get diagnostics changed=row_count;
  end if;
  if matched and previous.approved_imdb_id is not null and previous.approved_imdb_id<>imdb_id then raise exception 'Conflicting previous identity'; end if;
  if matched and (p_match->>'status'<>'approved' or p_match->>'imdb_id' is distinct from imdb_id) then raise exception 'Conflicting match identity'; end if;
  if not matched and p_match->>'status'<>'pending' then raise exception 'Publication required'; end if;
 end if;
 if matched then
  if coalesce(movie_id,'') !~ '^([0-9]{1,8}|tt[0-9]{7,10})$' or coalesce(imdb_id,'') !~ '^tt[0-9]{7,10}$'
   or jsonb_typeof(p_reports) is distinct from 'array' then raise exception 'Verified release required'; end if;
  if jsonb_array_length(p_reports)<1 or jsonb_array_length(p_reports)>8 or octet_length(p_reports::text)>100000 then raise exception 'Verified release required'; end if;
  if exists(select 1 from jsonb_array_elements(p_reports) r where r->>'sourceName' is distinct from 'When To Stream' or r->>'filmImdbId' is distinct from imdb_id
   or coalesce(r->>'source','') !~ '^https://whentostream[.]com/[a-z0-9-]+/$'
   or coalesce(r->>'filmIdentityMethod','') not in ('reviewed','structured','corroborated')
   or (r->>'filmIdentityMethod'='structured' and r->>'filmIdentitySource' is distinct from r->>'source')
   or (r->>'filmIdentityMethod'<>'structured' and (p_match is null or r->>'filmIdentitySource' is distinct from p_match->'profile'->>'sourceFilmUrl')))
   or jsonb_array_length(a_list_private.verified_movie(jsonb_set(p_movie,'{releases}',p_reports))->'releases')<>jsonb_array_length(p_reports) then raise exception 'Verified release required'; end if;
  select * into current_movie from public.a_list_movies m where m.id=p_movie->>'id' for update;
  if found and (p_version is null or current_movie.updated_at<>p_version) then raise exception 'Catalogue changed; retry'; end if;
  if not found and p_version is not null then raise exception 'Catalogue changed; retry'; end if;
  if exists(select 1 from public.a_list_movies m where m.movie->>'imdbId'=imdb_id and m.id<>movie_id
   and a_list_private.verified_identity(m.movie) is distinct from imdb_id) then raise exception 'Unverified duplicate catalogue identity'; end if;
  insert into public.a_list_movies(id,movie,updated_at,refresh_after)
   values(movie_id,p_movie,stamp,stamp+interval '6 hours')
   on conflict(id) do update set movie=excluded.movie,updated_at=stamp,refresh_after=least(a_list_movies.refresh_after,excluded.refresh_after),refresh_failures=a_list_movies.refresh_failures,requested_at=a_list_movies.requested_at;
  -- Same verified film, different legacy IDs: preserve memberships and event UIDs.
  -- Only verified WTS windows are shared; an alias's listed primary window keeps priority.
  update public.a_list_movies m set movie=jsonb_set(m.movie,'{releases}',
   coalesce((select jsonb_agg(case when r->>'sourceName'<>'When To Stream' and r->>'confidence'='listed'
    then coalesce((select a_list_private.release_conflict(r,fresh) from jsonb_array_elements(p_reports) fresh where fresh->>'kind'=r->>'kind' limit 1),r) else r end) from jsonb_array_elements(m.movie->'releases') r
    where not exists(select 1 from jsonb_array_elements(p_reports) fresh where fresh->>'kind'=r->>'kind')
     or (r->>'sourceName'<>'When To Stream' and r->>'confidence'='listed')),'[]'::jsonb)
   ||coalesce((select jsonb_agg(r) from jsonb_array_elements(p_reports) r
    where not exists(select 1 from jsonb_array_elements(m.movie->'releases') existing
     where existing->>'kind'=r->>'kind' and existing->>'sourceName'<>'When To Stream' and existing->>'confidence'='listed')),'[]'::jsonb)),
   updated_at=stamp
  where m.id<>movie_id and a_list_private.verified_identity(m.movie)=imdb_id;
  update public.a_list_source_status s set catalogue=coalesce((select jsonb_agg(coalesce((select alias.movie from public.a_list_movies alias where alias.id=m->>'id' and a_list_private.verified_identity(alias.movie)=imdb_id),m)) from jsonb_array_elements(s.catalogue) m),'[]'::jsonb)||
   case when exists(select 1 from jsonb_array_elements(s.catalogue) m where m->>'id'=movie_id) then '[]'::jsonb else jsonb_build_array(p_movie) end,
   version=gen_random_uuid()::text,updated_at=stamp where id;
 elsif changed>0 then
  update public.a_list_source_status set version=gen_random_uuid()::text,updated_at=stamp where id;
 end if;
 if p_match is not null then
  insert into public.a_list_release_candidates(source_id,profile,fingerprint,reports,suggestions,status,approved_imdb_id,movie_id,reviewed_fingerprint,reviewed_at,rationale,checked_at,updated_at,match_method,rule_version,profile_checked_at)
  values(source_id,p_match->'profile',p_match->>'fingerprint',p_match->'reports',p_match->'suggestions',p_match->>'status',imdb_id,movie_id,
   case when matched then p_match->>'fingerprint' end,case when matched then stamp end,p_match->>'rationale',stamp,stamp,p_match->>'method',(p_match->>'rule_version')::integer,coalesce((p_match->>'profile_checked_at')::timestamptz,previous.profile_checked_at))
  on conflict on constraint a_list_release_candidates_pkey do update set
   profile=excluded.profile,fingerprint=excluded.fingerprint,reports=excluded.reports,suggestions=excluded.suggestions,status=excluded.status,
   approved_imdb_id=coalesce(excluded.approved_imdb_id,a_list_release_candidates.approved_imdb_id),movie_id=coalesce(excluded.movie_id,a_list_release_candidates.movie_id),
   reviewed_fingerprint=excluded.reviewed_fingerprint,reviewed_at=case when excluded.match_method='reviewed' then coalesce(a_list_release_candidates.reviewed_at,excluded.reviewed_at) else excluded.reviewed_at end,rationale=excluded.rationale,checked_at=stamp,updated_at=stamp,match_method=excluded.match_method,rule_version=excluded.rule_version,profile_checked_at=excluded.profile_checked_at;
 end if;
 return jsonb_build_object('matched',matched,'movieId',movie_id,'changed',changed);
end;
$$;
revoke all on function public.a_list_store_release_match(jsonb,jsonb,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.a_list_store_release_match(jsonb,jsonb,timestamptz,jsonb) to service_role;


create function a_list_private.clear_release_conflict() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 -- Retired reports may have supplied a conflicting date, without being the selected window.
 if old.reports is distinct from new.reports then
  update public.a_list_movies m set movie=jsonb_set(m.movie,'{releases}',(
   select jsonb_agg(case when r->'conflictingRelease'->>'filmImdbId'=old.approved_imdb_id
    and exists(select 1 from jsonb_array_elements(old.reports) proof where proof->'release'->>'source'=r->'conflictingRelease'->>'source' and proof->'release'->>'kind'=r->>'kind')
    and not exists(select 1 from jsonb_array_elements(new.reports) proof where proof->'release'->>'source'=r->'conflictingRelease'->>'source' and proof->'release'->>'kind'=r->>'kind')
    then r-'conflictingRelease' else r end) from jsonb_array_elements(m.movie->'releases') r
  )),updated_at=clock_timestamp()
  where a_list_private.verified_identity(m.movie)=old.approved_imdb_id
  and exists(select 1 from jsonb_array_elements(m.movie->'releases') r where r ? 'conflictingRelease');
 end if;
 return new;
end;
$$;
revoke all on function a_list_private.clear_release_conflict() from public,anon,authenticated;
create trigger a_list_clear_release_conflict after update on public.a_list_release_candidates
 for each row execute function a_list_private.clear_release_conflict();

create or replace function public.a_list_record_source_check(p_source text,p_success boolean) returns void
 language plpgsql security invoker set search_path='' as $$
declare stamp timestamptz:=clock_timestamp();
begin
 if p_source is null or p_source not in ('primary','wts_reports','wts_discovery','wts_lookup','wts_feed','catalogue') or p_success is null then raise exception 'Invalid source check'; end if;
 update public.a_list_source_status set source_health=jsonb_set(source_health,array[p_source],
  coalesce(source_health->p_source,'{}'::jsonb)||jsonb_build_object('lastAttempt',stamp,'ok',p_success,
   'lastSuccess',case when p_success then to_jsonb(stamp) else source_health->p_source->'lastSuccess' end,
   'lastFailure',case when not p_success then to_jsonb(stamp) else source_health->p_source->'lastFailure' end,
   'failures',case when p_success then 0 else coalesce((source_health->p_source->>'failures')::integer,0)+1 end)) where id;
end;
$$;
revoke all on function public.a_list_record_source_check(text,boolean) from public,anon,authenticated;
grant execute on function public.a_list_record_source_check(text,boolean) to service_role;


-- Retry historical series-candidate exclusions through fresh verification, without changing identity proof.
update public.a_list_wts_profiles p set check_after=least(check_after,now()),attempts=0,priority=greatest(priority,1)
 where outcome='not_movie' and not exists(select 1 from public.a_list_release_candidates c where c.source_id=p.source_id and c.profile->'facts'->>'series'='true');
update public.a_list_wts_announcements set outcome=null,entry=entry-'outcome'-'checkedAt'-'nextCheckAt',checked_at=null,check_after=now(),attempts=0,version=version+1 where outcome='not_movie';
