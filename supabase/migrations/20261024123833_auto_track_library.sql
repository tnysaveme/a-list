-- Library membership also controls calendar membership.
alter table public.a_list_library alter column tracked set default true;
update public.a_list_library set tracked = true where not tracked;
