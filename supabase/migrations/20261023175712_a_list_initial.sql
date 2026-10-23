-- A-List's owner-authenticated library. Calendar subscribers receive only the
-- tracked subset through a deliberately narrow secret-token capability.
create table public.a_list_accounts (
  id uuid primary key references auth.users(id) on delete cascade,
  feed_token text not null unique default (gen_random_uuid()::text || replace(gen_random_uuid()::text, '-', '')),
  include_rumors boolean not null default false
);

create table public.a_list_library (
  user_id uuid not null references auth.users(id) on delete cascade,
  movie_id text not null check (movie_id ~ '^[0-9]{1,8}$'),
  movie jsonb not null check (jsonb_typeof(movie) = 'object'),
  tracked boolean not null default false,
  added_at timestamptz not null default now(),
  primary key (user_id, movie_id)
);

create table public.a_list_source_cache (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.a_list_accounts enable row level security;
alter table public.a_list_library enable row level security;
alter table public.a_list_source_cache enable row level security;

revoke all on public.a_list_accounts, public.a_list_library, public.a_list_source_cache from public, anon;
grant select, insert, update, delete on public.a_list_accounts, public.a_list_library, public.a_list_source_cache to authenticated;

create policy owner_account on public.a_list_accounts for all to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy owner_library on public.a_list_library for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy owner_cache on public.a_list_source_cache for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Keep the privileged implementation outside the API's exposed schemas.
create schema if not exists a_list_private;
revoke all on schema a_list_private from public;
grant usage on schema a_list_private to anon, authenticated;

create function a_list_private.read_calendar(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare owner_row public.a_list_accounts%rowtype;
begin
  if p_token is null or p_token !~ '^[a-f0-9-]{68}$' then return null; end if;
  select * into owner_row from public.a_list_accounts where feed_token = p_token;
  if not found then return null; end if;
  -- A signed-in caller may only use its own token. Anonymous Apple Calendar
  -- requests intentionally authenticate by possession of this unguessable URL.
  if auth.uid() is not null and auth.uid() <> owner_row.id then return null; end if;
  return jsonb_build_object(
    'includeRumors', owner_row.include_rumors,
    'movies', coalesce((select jsonb_agg(movie order by movie_id)
      from public.a_list_library where user_id = owner_row.id and tracked), '[]'::jsonb)
  );
end;
$$;
revoke all on function a_list_private.read_calendar(text) from public;
grant execute on function a_list_private.read_calendar(text) to anon, authenticated;

create function public.a_list_calendar_feed(p_token text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select a_list_private.read_calendar(p_token);
$$;
revoke all on function public.a_list_calendar_feed(text) from public;
grant execute on function public.a_list_calendar_feed(text) to anon, authenticated;
