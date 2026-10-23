-- Existing numeric IDs stay unchanged. IMDb IDs cover films absent from the
-- release-date provider; ownership policies and calendar tokens stay unchanged.
alter table public.a_list_movies drop constraint a_list_movies_id_check;
alter table public.a_list_movies add constraint a_list_movies_id_check
 check (id ~ '^([0-9]{1,8}|tt[0-9]{7,10})$');
alter table public.a_list_library drop constraint a_list_library_movie_id_check;
alter table public.a_list_library add constraint a_list_library_movie_id_check
 check (movie_id ~ '^([0-9]{1,8}|tt[0-9]{7,10})$');
