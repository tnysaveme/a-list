-- Reuse the existing private match records; historical human review rows remain immutable.
alter table public.a_list_release_candidates
 add column match_method text not null default 'reviewed' check (match_method in ('reviewed','structured','corroborated')),
 add column rule_version integer not null default 0,
 add column profile_checked_at timestamptz;
update public.a_list_release_candidates set profile_checked_at=checked_at;
alter table public.a_list_source_status
 add column wts_feed jsonb not null default '[]'::jsonb check (jsonb_typeof(wts_feed)='array' and jsonb_array_length(wts_feed)<=80),
 add column wts_feed_after timestamptz;
-- Imported films survive feed rotation and later source catalogue refreshes.
update public.a_list_movies m set movie=m.movie||jsonb_build_object('discoveredFrom','When To Stream')
 where exists(select 1 from public.a_list_release_candidates c where c.movie_id=m.id);

create function public.a_list_withhold_release_report(p_source text) returns integer
 language plpgsql security invoker set search_path='' as $$
declare changed integer;
begin
 if coalesce(p_source,'') !~ '^https://whentostream[.]com/[a-z0-9-]+/$' then raise exception 'Invalid report source'; end if;
 perform pg_advisory_xact_lock(hashtext('a_list_release_review'));
 update public.a_list_movies m set movie=jsonb_set(m.movie,'{releases}',coalesce((
  select jsonb_agg(r) from jsonb_array_elements(m.movie->'releases') r where r->>'sourceName' is distinct from 'When To Stream' or r->>'source' is distinct from p_source
 ),'[]'::jsonb)),updated_at=clock_timestamp()
 where exists(select 1 from jsonb_array_elements(m.movie->'releases') r where r->>'sourceName'='When To Stream' and r->>'source'=p_source);
 get diagnostics changed=row_count;
 if changed>0 then update public.a_list_source_status set version=gen_random_uuid()::text,updated_at=clock_timestamp() where id; end if;
 return changed;
end;
$$;
revoke all on function public.a_list_withhold_release_report(text) from public,anon,authenticated;
grant execute on function public.a_list_withhold_release_report(text) to service_role;

-- Only the authenticated background service may publish automatic evidence.
-- This does not impersonate an owner or write to the historical human review log.
create function public.a_list_store_release_match(p_match jsonb default null,p_movie jsonb default null,p_version timestamptz default null,p_reports jsonb default null)
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
   ),'[]'::jsonb)),updated_at=stamp where m.id=previous.movie_id;
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
  if exists(select 1 from public.a_list_movies m where m.movie->>'imdbId'=imdb_id and m.id<>movie_id) then raise exception 'Duplicate catalogue identity'; end if;
  insert into public.a_list_movies(id,movie,updated_at,refresh_after)
   values(movie_id,p_movie,stamp,stamp+interval '6 hours')
   on conflict(id) do update set movie=excluded.movie,updated_at=stamp,refresh_after=excluded.refresh_after,refresh_failures=0,requested_at=null;
  update public.a_list_source_status s set catalogue=coalesce((select jsonb_agg(case when m->>'id'=movie_id then p_movie else m end) from jsonb_array_elements(s.catalogue) m),'[]'::jsonb)||
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
