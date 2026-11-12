-- Rebuildable diagnostics, adaptive lookup state, and compact catalogue reads.
alter table public.a_list_wts_profiles add column diagnostic jsonb not null default '{}'::jsonb check(jsonb_typeof(diagnostic)='object'), add column last_success_at timestamptz;
alter table public.a_list_movies add column report_lookup_misses integer not null default 0 check(report_lookup_misses>=0);
alter table public.a_list_source_status add column catalogue_version text not null default gen_random_uuid()::text,
 add column catalogue_partitions jsonb not null default '{}'::jsonb check(jsonb_typeof(catalogue_partitions)='object');

-- Identity evidence can be valid even when the source has no dated release.
-- This deliberately cannot publish a movie or a release.
create function public.a_list_store_release_identity(p_match jsonb,p_movie_id text default null) returns void
 language plpgsql security invoker set search_path='' as $$
declare previous public.a_list_release_candidates%rowtype; stamp timestamptz:=clock_timestamp();
begin
 perform pg_advisory_xact_lock(hashtext('a_list_release_review'));
 if coalesce(p_match->>'source_id','') !~ '^[0-9]{1,10}$'
  or p_match->'profile'->>'sourceFilmId' is distinct from p_match->>'source_id'
  or coalesce(p_match->'profile'->>'sourceFilmUrl','') !~ '^https://whentostream[.]com/[a-z0-9-]+/$'
  or coalesce(p_match->>'fingerprint','') !~ '^[a-f0-9]{64}$'
  or coalesce(p_match->>'imdb_id','') !~ '^tt[0-9]{7,10}$'
  or coalesce(p_match->>'method','') not in ('reviewed','structured','corroborated')
  or octet_length(p_match::text)>100000 then raise exception 'Invalid source identity'; end if;
 select * into previous from public.a_list_release_candidates where source_id=p_match->>'source_id' for update;
 if previous.approved_imdb_id is not null and previous.approved_imdb_id<>p_match->>'imdb_id' then raise exception 'Conflicting previous identity'; end if;
 if p_movie_id is not null and not exists(select 1 from public.a_list_movies where id=p_movie_id and a_list_private.verified_identity(movie)=p_match->>'imdb_id') then raise exception 'Conflicting movie identity'; end if;
 insert into public.a_list_release_candidates(source_id,profile,fingerprint,reports,suggestions,status,approved_imdb_id,movie_id,reviewed_fingerprint,reviewed_at,rationale,checked_at,updated_at,match_method,rule_version,profile_checked_at)
 values(p_match->>'source_id',p_match->'profile',p_match->>'fingerprint',coalesce(previous.reports,'[]'::jsonb),coalesce(previous.suggestions,'[]'::jsonb),'approved',p_match->>'imdb_id',coalesce(p_movie_id,previous.movie_id),p_match->>'fingerprint',case when p_match->>'method'='reviewed' then coalesce(previous.reviewed_at,stamp) else stamp end,p_match->>'rationale',stamp,stamp,p_match->>'method',(p_match->>'rule_version')::integer,stamp)
 on conflict(source_id) do update set profile=excluded.profile,fingerprint=excluded.fingerprint,status=excluded.status,approved_imdb_id=excluded.approved_imdb_id,movie_id=excluded.movie_id,reviewed_fingerprint=excluded.reviewed_fingerprint,reviewed_at=excluded.reviewed_at,rationale=excluded.rationale,checked_at=stamp,updated_at=stamp,match_method=excluded.match_method,rule_version=excluded.rule_version,profile_checked_at=stamp;
end;
$$;
revoke all on function public.a_list_store_release_identity(jsonb,text) from public,anon,authenticated;
grant execute on function public.a_list_store_release_identity(jsonb,text) to service_role;

create function public.a_list_report_lookup_context(p_id text) returns jsonb
 language sql stable security invoker set search_path='' as $$
 with aliases as (select * from public.a_list_movies where id=p_id or a_list_private.verified_identity(movie)=p_id)
 select jsonb_build_object('saved',exists(select 1 from public.a_list_library where movie_id in(select id from aliases)),
 'misses',coalesce((select max(report_lookup_misses) from aliases),0),
 'revision',coalesce((select max(p.modified_at)::text from public.a_list_wts_profiles p join public.a_list_release_candidates c using(source_id) where c.approved_imdb_id=p_id),''),
 'profiles',coalesce((select jsonb_agg(jsonb_build_object('source',p.source,'title',p.title)) from public.a_list_wts_profiles p join public.a_list_release_candidates c using(source_id) where c.approved_imdb_id=p_id and c.status='approved'),'[]'::jsonb));
$$;
create function public.a_list_checkpoint_report_lookup(p_id text,p_after timestamptz,p_missed boolean) returns void
 language sql security invoker set search_path='' as $$
 update public.a_list_movies set report_lookup_after=p_after,report_lookup_misses=case when p_missed is null then report_lookup_misses when p_missed then least(report_lookup_misses+1,8) else 0 end
 where id=p_id or a_list_private.verified_identity(movie)=(select a_list_private.verified_identity(movie) from public.a_list_movies where id=p_id);
$$;
create function a_list_private.reset_changed_profile_lookup() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 if new.modified_at is distinct from old.modified_at then
 update public.a_list_movies m set report_lookup_after=least(report_lookup_after,now()),report_lookup_misses=0
 where a_list_private.verified_identity(m.movie)=(select approved_imdb_id from public.a_list_release_candidates where source_id=new.source_id);
 end if;
 return new;
end;
$$;
create trigger reset_changed_profile_lookup after update of modified_at on public.a_list_wts_profiles for each row execute function a_list_private.reset_changed_profile_lookup();
revoke all on function public.a_list_report_lookup_context(text),public.a_list_checkpoint_report_lookup(text,timestamptz,boolean),a_list_private.reset_changed_profile_lookup() from public,anon,authenticated;
grant execute on function public.a_list_report_lookup_context(text),public.a_list_checkpoint_report_lookup(text,timestamptz,boolean),a_list_private.reset_changed_profile_lookup() to service_role;

create function a_list_private.movie_card(p_movie jsonb) returns jsonb language sql immutable security invoker set search_path='' as $$
 select p_movie-array['overview','overviewSource','metadataCheckedAt','synopsisCheckedAt','saved','tracked','addedAt'];
$$;
revoke all on function a_list_private.movie_card(jsonb) from public,anon;
grant execute on function a_list_private.movie_card(jsonb) to authenticated,service_role;
create function a_list_private.catalogue_movie_changed() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op<>'UPDATE' or a_list_private.movie_card(new.movie) is distinct from a_list_private.movie_card(old.movie) then
 update public.a_list_source_status set catalogue_version=gen_random_uuid()::text where id;
 end if;
 return null;
end;
$$;
create trigger catalogue_movie_changed after insert or update or delete on public.a_list_movies for each row execute function a_list_private.catalogue_movie_changed();
create function a_list_private.catalogue_listing_changed() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.catalogue is distinct from old.catalogue or new.catalogue_success_at is distinct from old.catalogue_success_at then new.catalogue_version=gen_random_uuid()::text; end if;
 return new;
end;
$$;
create trigger catalogue_listing_changed before update on public.a_list_source_status for each row execute function a_list_private.catalogue_listing_changed();
revoke all on function a_list_private.catalogue_movie_changed(),a_list_private.catalogue_listing_changed() from public,anon,authenticated;
grant execute on function a_list_private.catalogue_movie_changed(),a_list_private.catalogue_listing_changed() to service_role;
create function public.a_list_catalogue_snapshot() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('movies',coalesce((select jsonb_agg(a_list_private.movie_card(coalesce(m.movie,entry)) order by position)
 from jsonb_array_elements(s.catalogue) with ordinality as entries(entry,position) left join public.a_list_movies m on m.id=entry->>'id'),'[]'::jsonb),'checkedAt',s.catalogue_success_at)
 from public.a_list_source_status s where id;
$$;
revoke all on function public.a_list_catalogue_snapshot() from public,anon;
grant execute on function public.a_list_catalogue_snapshot() to authenticated,service_role;

create function public.a_list_publish_catalogue_partitions(p_movies jsonb,p_checked_at timestamptz,p_versions jsonb,p_partitions jsonb) returns jsonb
 language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if jsonb_typeof(p_partitions) is distinct from 'object' or octet_length(p_partitions::text)>10000000 then raise exception 'Invalid catalogue partitions'; end if;
 result:=public.a_list_publish_catalogue_versioned(p_movies,p_checked_at,p_versions);
 update public.a_list_source_status set catalogue_partitions=p_partitions where id;
 return result;
end;
$$;
revoke all on function public.a_list_publish_catalogue_partitions(jsonb,timestamptz,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.a_list_publish_catalogue_partitions(jsonb,timestamptz,jsonb,jsonb) to service_role;

create function public.a_list_queue_health() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'profiles',(select jsonb_build_object('due',count(*),'oldestDueAt',min(check_after)) from public.a_list_wts_profiles where check_after<=now()),
 'saved',(select jsonb_build_object('due',count(*),'oldestDueAt',min(refresh_after)) from public.a_list_movies m where refresh_after<=now() and exists(select 1 from public.a_list_library l where l.movie_id=m.id)),
 'lookups',(select jsonb_build_object('due',count(*),'oldestDueAt',min(report_lookup_after)) from public.a_list_movies m where report_lookup_after<=now() and m.movie->>'mediaType' is distinct from 'series' and nullif(m.movie->>'year','') is not null
 and (a_list_private.verified_identity(m.movie) is not null or (m.id~'^[0-9]{1,8}$' and m.movie->>'source'~'^https://www[.]dvdsreleasedates[.]com/movies/[0-9]{1,8}/'))
 and (not exists(select 1 from jsonb_array_elements(a_list_private.verified_movie(m.movie)->'releases') r where r->>'kind' in ('Digital','PVOD') and r->>'confidence'='listed') or not exists(select 1 from jsonb_array_elements(a_list_private.verified_movie(m.movie)->'releases') r where r->>'kind'='Subscription' and r->>'confidence'='listed'))),
 'recentDiagnostics',coalesce((select jsonb_agg(row_to_json(d)) from (select source_id,title,outcome,diagnostic,checked_at,last_success_at,check_after from public.a_list_wts_profiles where diagnostic<>'{}'::jsonb order by checked_at desc limit 20) d),'[]'::jsonb));
$$;
revoke all on function public.a_list_queue_health() from public,anon,authenticated;
grant execute on function public.a_list_queue_health() to service_role;
