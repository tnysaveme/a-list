-- Rebuildable source cursor only; existing service-only status access remains in force.
alter table public.a_list_source_status
 add column wts_profile_changes jsonb not null default '{}'::jsonb
 check(jsonb_typeof(wts_profile_changes)='object');

-- Do not carry the old six-hour announcement delay into the frequent discovery worker.
update public.a_list_source_status set wts_feed_after=least(wts_feed_after,now()) where id;
