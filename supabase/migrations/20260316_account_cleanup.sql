alter table public.profiles
add column if not exists email text;

update public.profiles
set plan = 'artist'
where plan = 'artist_pro';

update public.profiles
set is_pro = false
where plan = 'artist';

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is distinct from u.email;

create or replace function public.sync_profile_email_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists sync_profile_email_from_auth on auth.users;

create trigger sync_profile_email_from_auth
after insert or update of email on auth.users
for each row
execute function public.sync_profile_email_from_auth();
