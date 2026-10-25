-- Supabase's public-schema defaults may grant anon EXECUTE separately from PUBLIC.
-- Library pagination is an authenticated operation; retain its existing RLS.
revoke all on function public.a_list_library_page(text,text,integer,integer,boolean) from anon;
