alter table public.track_versions
add column if not exists root_version_id uuid null;

alter table public.track_versions
drop constraint if exists track_versions_root_version_id_fkey;

alter table public.track_versions
add constraint track_versions_root_version_id_fkey
foreign key (root_version_id)
references public.track_versions(id)
on delete set null;

update public.track_versions child
set root_version_id = root.id
from public.track_versions root
where child.root_version_id is null
  and child.track_group_id = root.track_group_id
  and root.is_original = true;

update public.track_versions
set root_version_id = id
where root_version_id is null
  and is_original = true;

create index if not exists track_versions_root_version_idx
on public.track_versions(root_version_id);

create or replace function public.set_track_versions_root_version_id()
returns trigger
language plpgsql
as $$
begin
  if new.root_version_id is null then
    if new.is_original = true then
      new.root_version_id := new.id;
    elsif new.parent_version_id is not null then
      select coalesce(parent.root_version_id, parent.id)
      into new.root_version_id
      from public.track_versions parent
      where parent.id = new.parent_version_id;
    end if;

    if new.root_version_id is null then
      select root.id
      into new.root_version_id
      from public.track_versions root
      where root.track_group_id = new.track_group_id
        and root.is_original = true
      order by root.version_number asc, root.created_at asc
      limit 1;
    end if;

    if new.root_version_id is null then
      new.root_version_id := new.id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists set_track_versions_root_version_id on public.track_versions;

create trigger set_track_versions_root_version_id
before insert on public.track_versions
for each row
execute function public.set_track_versions_root_version_id();
