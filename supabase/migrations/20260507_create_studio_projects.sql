create extension if not exists pgcrypto;

create table if not exists public.studio_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  track_group_id uuid null,
  project_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists studio_projects_user_id_idx
on public.studio_projects(user_id);

create index if not exists studio_projects_track_group_id_idx
on public.studio_projects(track_group_id);

create unique index if not exists studio_projects_track_group_id_key
on public.studio_projects(track_group_id)
where track_group_id is not null;

alter table public.studio_projects enable row level security;

drop policy if exists "studio_projects_select_own" on public.studio_projects;
create policy "studio_projects_select_own"
on public.studio_projects
for select
using (
  auth.uid() = user_id
);

drop policy if exists "studio_projects_insert_own" on public.studio_projects;
create policy "studio_projects_insert_own"
on public.studio_projects
for insert
with check (
  auth.uid() = user_id
);

drop policy if exists "studio_projects_update_own" on public.studio_projects;
create policy "studio_projects_update_own"
on public.studio_projects
for update
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
);

do $$
begin
  if to_regprocedure('public.set_generation_jobs_updated_at()') is not null then
    drop trigger if exists studio_projects_set_updated_at on public.studio_projects;
    create trigger studio_projects_set_updated_at
    before update on public.studio_projects
    for each row
    execute function public.set_generation_jobs_updated_at();
  end if;
end $$;
