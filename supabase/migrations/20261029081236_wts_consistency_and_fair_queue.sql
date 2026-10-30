-- Reuse the existing worker and internal source cache; no client permissions are added.
alter table public.a_list_wts_profiles
 add column attempts integer not null default 0 check(attempts>=0),
 add column priority smallint not null default 0 check(priority between 0 and 2);
alter table public.a_list_source_status
 add column wts_coverage jsonb not null default '{}'::jsonb check(jsonb_typeof(wts_coverage)='object');

create or replace function public.a_list_queue_wts_profiles(p_profiles jsonb) returns void
 language plpgsql security invoker set search_path='' as $$
begin
 if jsonb_typeof(p_profiles) is distinct from 'array' or jsonb_array_length(p_profiles)>100 or octet_length(p_profiles::text)>200000 then raise exception 'Invalid source inventory'; end if;
 insert into public.a_list_wts_profiles(source_id,source,title,film_year,modified_at,priority)
 select source_id,source,title,film_year,modified_at,1 from jsonb_to_recordset(p_profiles) as profiles(source_id text,source text,title text,film_year text,modified_at timestamptz)
 on conflict(source_id) do update set source=excluded.source,title=excluded.title,film_year=excluded.film_year,modified_at=excluded.modified_at,
 check_after=least(a_list_wts_profiles.check_after,now()),checked_at=null,outcome=null,failures=0,attempts=0,audit='{}'::jsonb,priority=greatest(a_list_wts_profiles.priority,1)
 where excluded.modified_at>=a_list_wts_profiles.modified_at and
 (excluded.modified_at>a_list_wts_profiles.modified_at or excluded.source<>a_list_wts_profiles.source or excluded.title<>a_list_wts_profiles.title or excluded.film_year<>a_list_wts_profiles.film_year);
end;
$$;

-- Integrity repairs first, then aging work, saved films, and new/changed profiles.
create function public.a_list_due_wts_profiles(p_limit integer default 4) returns setof jsonb
 language sql stable security invoker set search_path='' as $$
 select to_jsonb(p)||jsonb_build_object('saved',s.saved)
 from public.a_list_wts_profiles p
 cross join lateral(select exists(select 1 from public.a_list_library l where l.movie_id=p.movie_id
  or exists(select 1 from public.a_list_release_candidates c where c.source_id=p.source_id and c.movie_id=l.movie_id)) as saved) s
 where p.check_after<=now()
 order by case when p.priority=2 then 0 when p.check_after<now()-interval '1 day' then 1 when s.saved then 2 when p.priority=1 or p.checked_at is null then 3 else 4 end,
 p.check_after,p.modified_at desc,p.source_id
 limit greatest(1,least(p_limit,8));
$$;
revoke all on function public.a_list_due_wts_profiles(integer) from public,anon,authenticated;
grant execute on function public.a_list_due_wts_profiles(integer) to service_role;

-- Compare all verified aliases with approved evidence. Queue fresh source verification;
-- never restore a date from an old snapshot or overwrite primary-source preference.
create function public.a_list_reconcile_wts_coverage(p_limit integer default 16) returns jsonb
 language plpgsql security invoker set search_path='' as $$
declare gaps text[]; queued integer; result jsonb;
begin
 select coalesce(array_agg(distinct c.source_id),'{}'::text[]) into gaps
 from public.a_list_release_candidates c
 join public.a_list_wts_profiles p on p.source_id=c.source_id
 join public.a_list_movies m on a_list_private.verified_identity(m.movie)=c.approved_imdb_id
 cross join lateral jsonb_array_elements(c.reports) proof
 where c.status='approved' and c.fingerprint=c.reviewed_fingerprint
 and m.movie->>'mediaType' is distinct from 'series'
 and proof->'release'->>'filmImdbId'=c.approved_imdb_id
 and proof->'release'->>'sourceName'='When To Stream'
 and not exists(select 1 from jsonb_array_elements(m.movie->'releases') r
  where r->>'kind'=proof->'release'->>'kind' and
   ((r->>'sourceName' is distinct from 'When To Stream' and r->>'confidence'='listed') or
    (r->>'filmImdbId'=c.approved_imdb_id and r->>'date'=proof->'release'->>'date'
     and r->>'platform' is not distinct from proof->'release'->>'platform'
     and r->>'confidence'=proof->'release'->>'confidence')));
 update public.a_list_wts_profiles set priority=0 where priority=2 and not(source_id=any(gaps));
 update public.a_list_wts_profiles set priority=2,check_after=least(check_after,now()),attempts=0,failures=0
 where source_id in(select p.source_id from public.a_list_wts_profiles p where p.source_id=any(gaps) and p.priority<>2 order by p.source_id limit greatest(1,least(p_limit,100)));
 get diagnostics queued=row_count;
 result:=jsonb_build_object('checkedAt',clock_timestamp(),'unexplained',cardinality(gaps),'queued',queued);
 update public.a_list_source_status set wts_coverage=result where id;
 return result;
end;
$$;
revoke all on function public.a_list_reconcile_wts_coverage(integer) from public,anon,authenticated;
grant execute on function public.a_list_reconcile_wts_coverage(integer) to service_role;

-- Positive withdrawals retire their old evidence, preventing an audit repair loop.
create or replace function public.a_list_withhold_release_report(p_source text) returns integer
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
 update public.a_list_release_candidates c set reports=coalesce((select jsonb_agg(r) from jsonb_array_elements(c.reports) r where r->'release'->>'source' is distinct from p_source),'[]'::jsonb)
 where exists(select 1 from jsonb_array_elements(c.reports) r where r->'release'->>'source'=p_source);
 if changed>0 then update public.a_list_source_status set version=gen_random_uuid()::text,updated_at=clock_timestamp() where id; end if;
 return changed;
end;
$$;
create or replace function public.a_list_withdraw_release_windows(p_movie_id text,p_imdb_id text,p_source text,p_kinds text[],p_version timestamptz)
returns void language plpgsql security invoker set search_path='' as $$
declare current_movie public.a_list_movies%rowtype;
begin
 if p_movie_id is null or p_imdb_id is null or p_source is null or p_kinds is null or array_position(p_kinds,null) is not null or p_version is null or p_imdb_id !~ '^tt[0-9]{7,10}$' or p_source !~ '^https://whentostream[.]com/[a-z0-9-]+/$' or cardinality(p_kinds) not between 1 and 3 or not p_kinds <@ array['Digital','PVOD','Subscription'] then raise exception 'Invalid release withdrawal'; end if;
 select * into current_movie from public.a_list_movies where id=p_movie_id for update;
 if not found or current_movie.updated_at is distinct from p_version then raise exception 'Catalogue changed; retry'; end if;
 if coalesce(current_movie.movie->>'imdbId',current_movie.id) is distinct from p_imdb_id then raise exception 'Conflicting movie identity'; end if;
 update public.a_list_movies m set movie=jsonb_set(m.movie,'{releases}',coalesce((
  select jsonb_agg(r order by position) from jsonb_array_elements(m.movie->'releases') with ordinality as releases(r,position)
  where not coalesce((r->>'source'=p_source and r->>'kind'=any(p_kinds) and r->>'filmImdbId'=p_imdb_id),false)),'[]'::jsonb)),updated_at=clock_timestamp()
 where m.id=p_movie_id or a_list_private.verified_identity(m.movie)=p_imdb_id;
 update public.a_list_release_candidates c set reports=coalesce((select jsonb_agg(r) from jsonb_array_elements(c.reports) r
  where not coalesce(r->'release'->>'source'=p_source and r->'release'->>'kind'=any(p_kinds),false)),'[]'::jsonb)
 where c.approved_imdb_id=p_imdb_id;
 update public.a_list_source_status set catalogue=coalesce((select jsonb_agg(coalesce((select alias.movie from public.a_list_movies alias where alias.id=m->>'id' and a_list_private.verified_identity(alias.movie)=p_imdb_id),m)) from jsonb_array_elements(catalogue) m),'[]'::jsonb),version=gen_random_uuid()::text,updated_at=clock_timestamp() where id;
end;
$$;

-- Give the improved resolver one catch-up pass; subsequent failures back off.
update public.a_list_wts_profiles set check_after=least(check_after,now()),attempts=0
 where outcome in('insufficient_evidence','ambiguous_identity','source_unavailable','budget_exhausted');
