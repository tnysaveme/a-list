-- A global ID may have a native-listing and metadata alias. Never identify films by title alone.
create function a_list_private.verified_identity(p_movie jsonb) returns text
 language sql stable security invoker set search_path='' as $$
 select case when p_movie->>'id'~'^tt[0-9]{7,10}$'
  and (nullif(p_movie->>'imdbId','') is null or p_movie->>'imdbId'=p_movie->>'id') then p_movie->>'id'
 when p_movie->>'id'~'^[0-9]{1,8}$' and p_movie->>'imdbId'~'^tt[0-9]{7,10}$'
  and pg_input_is_valid(coalesce(p_movie->>'identityVerifiedAt',''),'timestamp with time zone') then p_movie->>'imdbId' end;
$$;
revoke all on function a_list_private.verified_identity(jsonb) from public,anon,authenticated;
grant execute on function a_list_private.verified_identity(jsonb) to service_role;

-- Every eligible catalogue film is covered, saved films first. The existing indexed due time rotates work.
create or replace function public.a_list_report_lookup_candidates(p_limit integer default 8) returns setof public.a_list_movies
 language sql stable security invoker set search_path='' as $$
 select m.* from public.a_list_movies m
 where m.report_lookup_after<=now() and m.movie->>'mediaType' is distinct from 'series'
  and nullif(m.movie->>'year','') is not null
  and (a_list_private.verified_identity(m.movie) is not null or (m.id~'^[0-9]{1,8}$' and m.movie->>'source'~'^https://www[.]dvdsreleasedates[.]com/movies/[0-9]{1,8}/'))
  and (not exists(select 1 from jsonb_array_elements(a_list_private.verified_movie(m.movie)->'releases') r where r->>'kind' in ('Digital','PVOD') and r->>'confidence'='listed')
   or not exists(select 1 from jsonb_array_elements(a_list_private.verified_movie(m.movie)->'releases') r where r->>'kind'='Subscription' and r->>'confidence'='listed'))
 order by exists(select 1 from public.a_list_library l where l.movie_id=m.id) desc,m.report_lookup_after,m.id
 limit greatest(1,least(p_limit,16));
$$;
revoke all on function public.a_list_report_lookup_candidates(integer) from public,anon,authenticated;
grant execute on function public.a_list_report_lookup_candidates(integer) to service_role;

-- Recheck old negative results under the new matching rules without altering personal data.
update public.a_list_movies set report_lookup_after=now();
update public.a_list_source_status set wts_feed_after=now(),wts_feed=coalesce((
 select jsonb_agg(entry-'nextCheckAt') from jsonb_array_elements(wts_feed) entry),'[]'::jsonb) where id;

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
   coalesce((select jsonb_agg(r) from jsonb_array_elements(m.movie->'releases') r
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

-- Explicit profile withdrawals reach every verified alias too.
create or replace function public.a_list_withdraw_release_windows(p_movie_id text,p_imdb_id text,p_source text,p_kinds text[],p_version timestamptz)
returns void language plpgsql security invoker set search_path='' as $$
declare current_movie public.a_list_movies%rowtype; movie_value jsonb;
begin
 if p_movie_id is null or p_imdb_id is null or p_source is null or p_kinds is null or array_position(p_kinds,null) is not null or p_version is null or p_imdb_id !~ '^tt[0-9]{7,10}$' or p_source !~ '^https://whentostream[.]com/[a-z0-9-]+/$' or cardinality(p_kinds) not between 1 and 3 or not p_kinds <@ array['Digital','PVOD','Subscription'] then raise exception 'Invalid release withdrawal'; end if;
 select * into current_movie from public.a_list_movies where id=p_movie_id for update;
 if not found or current_movie.updated_at is distinct from p_version then raise exception 'Catalogue changed; retry'; end if;
 if coalesce(current_movie.movie->>'imdbId',current_movie.id) is distinct from p_imdb_id then raise exception 'Conflicting movie identity'; end if;
 update public.a_list_movies m set movie=jsonb_set(m.movie,'{releases}',coalesce((
  select jsonb_agg(r order by position) from jsonb_array_elements(m.movie->'releases') with ordinality as releases(r,position)
  where not coalesce((r->>'source'=p_source and r->>'kind'=any(p_kinds) and r->>'filmImdbId'=p_imdb_id),false)),'[]'::jsonb)),updated_at=clock_timestamp()
 where m.id=p_movie_id or a_list_private.verified_identity(m.movie)=p_imdb_id;
 update public.a_list_source_status set catalogue=coalesce((select jsonb_agg(coalesce((select alias.movie from public.a_list_movies alias where alias.id=m->>'id' and a_list_private.verified_identity(alias.movie)=p_imdb_id),m)) from jsonb_array_elements(catalogue) m),'[]'::jsonb),version=gen_random_uuid()::text,updated_at=clock_timestamp() where id;
end;
$$;
revoke all on function public.a_list_withdraw_release_windows(text,text,text,text[],timestamptz) from public,anon,authenticated;
grant execute on function public.a_list_withdraw_release_windows(text,text,text,text[],timestamptz) to service_role;
