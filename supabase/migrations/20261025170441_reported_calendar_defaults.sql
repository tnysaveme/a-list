-- Sourced but unconfirmed dates belong on the calendar as tentative events.
alter table public.a_list_accounts alter column include_rumors set default true;
-- Apply the requested behavior to existing accounts. The settings trigger bumps
-- their calendar revision; feed links and library membership remain stable.
update public.a_list_accounts set include_rumors=true where not include_rumors;
