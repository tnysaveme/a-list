-- Global source evidence is accessible only through the owner-authorized server.
create table public.a_list_release_candidates (
 source_id text primary key check (source_id ~ '^[0-9]{1,10}$'),
 profile jsonb not null check (jsonb_typeof(profile)='object' and profile->>'sourceFilmId'=source_id),
 fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
 reports jsonb not null check (jsonb_typeof(reports)='array' and jsonb_array_length(reports)<=8),
 suggestions jsonb not null check (jsonb_typeof(suggestions)='array' and jsonb_array_length(suggestions)<=3),
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 approved_imdb_id text check (approved_imdb_id ~ '^tt[0-9]{7,10}$'),
 movie_id text references public.a_list_movies(id),
 reviewed_fingerprint text,
 reviewed_at timestamptz,
 rationale text,
 checked_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index a_list_candidate_status on public.a_list_release_candidates(status,updated_at desc,source_id);
create index a_list_movies_imdb_identity on public.a_list_movies((movie->>'imdbId'));
create table public.a_list_release_reviews (
 id bigint generated always as identity primary key,
 source_id text not null references public.a_list_release_candidates(source_id),
 reviewer_id uuid references auth.users(id) on delete set null,
 decision text not null check (decision in ('approve','reject')),
 fingerprint text not null,
 imdb_id text,
 rationale text not null,
 evidence jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.a_list_release_candidates enable row level security;
alter table public.a_list_release_reviews enable row level security;
revoke all on public.a_list_release_candidates,public.a_list_release_reviews from public,anon,authenticated,service_role;
grant select,insert,update on public.a_list_release_candidates to service_role;
grant select,insert on public.a_list_release_reviews to service_role;
grant usage,select on sequence public.a_list_release_reviews_id_seq to service_role;
grant usage on schema a_list_private to service_role;

create function public.a_list_stage_release_candidate(p_candidate jsonb) returns jsonb
 language plpgsql security invoker set search_path='' as $$
declare previous public.a_list_release_candidates%rowtype; v_source_id text:=p_candidate->>'source_id';
begin
 perform pg_advisory_xact_lock(hashtext('a_list_release_review'));
 select * into previous from public.a_list_release_candidates c where c.source_id=v_source_id for update;
 if not found and (select count(*) from public.a_list_release_candidates)>=20 then return jsonb_build_object('skipped','pilot_limit'); end if;
 if p_candidate is null or octet_length(p_candidate::text)>100000 or coalesce(p_candidate->'profile'->>'sourceFilmUrl','') !~ '^https://whentostream[.]com/[a-z0-9-]+/$' then raise exception 'Invalid source evidence'; end if;
 if previous.status='approved' and previous.fingerprint<>p_candidate->>'fingerprint' then
  update public.a_list_movies m set movie=jsonb_set(m.movie,'{releases}',coalesce((
   select jsonb_agg(r) from jsonb_array_elements(m.movie->'releases') r where r->>'filmIdentitySource' is distinct from previous.profile->>'sourceFilmUrl'
  ),'[]'::jsonb)),updated_at=clock_timestamp() where m.id=previous.movie_id;
 end if;
 insert into public.a_list_release_candidates(source_id,profile,fingerprint,reports,suggestions)
 values(v_source_id,p_candidate->'profile',p_candidate->>'fingerprint',p_candidate->'reports',p_candidate->'suggestions')
 on conflict on constraint a_list_release_candidates_pkey do update set
  profile=excluded.profile,fingerprint=excluded.fingerprint,reports=excluded.reports,suggestions=excluded.suggestions,
  status=case when a_list_release_candidates.fingerprint=excluded.fingerprint then a_list_release_candidates.status else 'pending' end,
  checked_at=clock_timestamp(),updated_at=clock_timestamp();
 return jsonb_build_object('staged',v_source_id);
end;
$$;
revoke all on function public.a_list_stage_release_candidate(jsonb) from public,anon,authenticated;
grant execute on function public.a_list_stage_release_candidate(jsonb) to service_role;

-- Publication and its audit record succeed atomically. It never changes a library.
create function public.a_list_decide_release_candidate(p_source_id text,p_version timestamptz,p_fingerprint text,p_decision text,p_reviewer uuid,p_rationale text,p_imdb_id text default null,p_movie jsonb default null,p_movie_version timestamptz default null)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare candidate public.a_list_release_candidates%rowtype; current_movie public.a_list_movies%rowtype; v_movie_id text; stamp timestamptz:=clock_timestamp();
begin
 perform pg_advisory_xact_lock(hashtext('a_list_release_review'));
 select * into candidate from public.a_list_release_candidates where source_id=p_source_id for update;
 if not found or p_version is null or p_fingerprint is null or candidate.updated_at<>p_version or candidate.fingerprint<>p_fingerprint or candidate.status<>'pending' then raise exception 'Review changed; reload before deciding'; end if;
 if p_decision not in ('approve','reject') or length(trim(p_rationale))<40 or length(p_rationale)>1200 or p_reviewer is null then raise exception 'Review evidence required'; end if;
 if p_decision='approve' then
  v_movie_id:=p_movie->>'id';
  if p_movie is null or p_imdb_id is null or p_imdb_id !~ '^tt[0-9]{7,10}$' or p_movie->>'imdbId' is distinct from p_imdb_id or v_movie_id !~ '^([0-9]{1,8}|tt[0-9]{7,10})$' or
    jsonb_array_length(a_list_private.verified_movie(p_movie)->'releases')=0 or
    not exists(select 1 from jsonb_array_elements(p_movie->'releases') r where r->>'filmImdbId'=p_imdb_id and r->>'filmIdentitySource'=candidate.profile->>'sourceFilmUrl') then raise exception 'Verified release required'; end if;
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
 values(p_source_id,p_reviewer,p_decision,p_fingerprint,p_imdb_id,p_rationale,jsonb_build_object('profile',candidate.profile,'suggestions',candidate.suggestions,'reports',candidate.reports,'publishedMovie',p_movie));
 return jsonb_build_object('status',case when p_decision='approve' then 'approved' else 'rejected' end,'movieId',v_movie_id);
end;
$$;
revoke all on function public.a_list_decide_release_candidate(text,timestamptz,text,text,uuid,text,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.a_list_decide_release_candidate(text,timestamptz,text,text,uuid,text,text,jsonb,timestamptz) to service_role;
