-- A reviewed identity can be approved while a listed primary-source date retains priority.
-- The new optional proof argument preserves compatibility with existing callers.
drop function public.a_list_decide_release_candidate(text,timestamptz,text,text,uuid,text,text,jsonb,timestamptz);

create function public.a_list_decide_release_candidate(p_source_id text,p_version timestamptz,p_fingerprint text,p_decision text,p_reviewer uuid,p_rationale text,p_imdb_id text default null,p_movie jsonb default null,p_movie_version timestamptz default null,p_verified_reports jsonb default null)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare candidate public.a_list_release_candidates%rowtype; current_movie public.a_list_movies%rowtype; v_movie_id text; review_reports jsonb; stamp timestamptz:=clock_timestamp();
begin
 perform pg_advisory_xact_lock(hashtext('a_list_release_review'));
 select * into candidate from public.a_list_release_candidates where source_id=p_source_id for update;
 if not found or p_version is null or p_fingerprint is null or candidate.updated_at<>p_version or candidate.fingerprint<>p_fingerprint or candidate.status<>'pending' then raise exception 'Review changed; reload before deciding'; end if;
 if p_decision not in ('approve','reject') or length(trim(p_rationale))<40 or length(p_rationale)>1200 or p_reviewer is null then raise exception 'Review evidence required'; end if;
 if p_decision='approve' then
  v_movie_id:=p_movie->>'id';
  review_reports:=coalesce(p_verified_reports,p_movie->'releases');
  if jsonb_typeof(review_reports) is distinct from 'array' or jsonb_array_length(review_reports)<1 or jsonb_array_length(review_reports)>8 or octet_length(review_reports::text)>100000 then raise exception 'Verified release required'; end if;
  if p_movie is null or p_imdb_id is null or p_imdb_id !~ '^tt[0-9]{7,10}$' or p_movie->>'imdbId' is distinct from p_imdb_id or v_movie_id !~ '^([0-9]{1,8}|tt[0-9]{7,10})$' or
    jsonb_array_length(a_list_private.verified_movie(jsonb_set(p_movie,'{releases}',review_reports))->'releases')=0 or
    not exists(select 1 from jsonb_array_elements(review_reports) r where r->>'sourceName'='When To Stream' and r->>'filmImdbId'=p_imdb_id and r->>'filmIdentitySource'=candidate.profile->>'sourceFilmUrl') then raise exception 'Verified release required'; end if;
  select * into current_movie from public.a_list_movies where id=v_movie_id for update;
  if found and (p_movie_version is null or current_movie.updated_at<>p_movie_version) then raise exception 'Catalogue changed; reload before deciding'; end if;
  if exists(select 1 from public.a_list_movies m where m.movie->>'imdbId'=p_imdb_id and m.id<>v_movie_id) then raise exception 'Duplicate catalogue identity requires review'; end if;
  insert into public.a_list_movies(id,movie,updated_at,refresh_after)
  values(v_movie_id,p_movie,stamp,stamp+interval '6 hours')
  on conflict(id) do update set movie=excluded.movie,updated_at=stamp,refresh_after=excluded.refresh_after,refresh_failures=0,requested_at=null;
  update public.a_list_source_status s set catalogue=coalesce((select jsonb_agg(case when m->>'id'=v_movie_id then p_movie else m end) from jsonb_array_elements(s.catalogue) m),'[]'::jsonb)||
   case when exists(select 1 from jsonb_array_elements(s.catalogue) m where m->>'id'=v_movie_id) then '[]'::jsonb else jsonb_build_array(p_movie) end,
   version=gen_random_uuid()::text,updated_at=stamp where id;
 end if;
 update public.a_list_release_candidates set status=case when p_decision='approve' then 'approved' else 'rejected' end,
  approved_imdb_id=case when p_decision='approve' then p_imdb_id end,movie_id=coalesce(v_movie_id,a_list_release_candidates.movie_id),
  reviewed_fingerprint=p_fingerprint,reviewed_at=stamp,rationale=p_rationale,updated_at=stamp where source_id=p_source_id;
 insert into public.a_list_release_reviews(source_id,reviewer_id,decision,fingerprint,imdb_id,rationale,evidence)
 values(p_source_id,p_reviewer,p_decision,p_fingerprint,p_imdb_id,p_rationale,jsonb_build_object('profile',candidate.profile,'suggestions',candidate.suggestions,'reports',candidate.reports,'publishedMovie',p_movie,'verifiedReports',review_reports));
 return jsonb_build_object('status',case when p_decision='approve' then 'approved' else 'rejected' end,'movieId',v_movie_id);
end;
$$;
revoke all on function public.a_list_decide_release_candidate(text,timestamptz,text,text,uuid,text,text,jsonb,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.a_list_decide_release_candidate(text,timestamptz,text,text,uuid,text,text,jsonb,timestamptz,jsonb) to service_role;
