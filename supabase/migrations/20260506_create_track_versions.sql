create extension if not exists pgcrypto;

create table if not exists public.track_versions (
  id uuid primary key default gen_random_uuid(),
  generation_job_id uuid references public.generation_jobs(id) on delete set null,
  parent_version_id uuid references public.track_versions(id) on delete set null,
  track_group_id uuid not null,
  version_number integer not null default 1,
  title text not null,
  version_label text null,
  provider text null,
  generation_mode text null,
  prompt text null,
  lyrics text null,
  vocal_mode text null,
  audio_url text not null,
  artwork_url text null,
  storage_path text null,
  duration integer null,
  is_original boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.generation_jobs
add column if not exists track_group_id uuid null,
add column if not exists track_version_id uuid null,
add column if not exists parent_version_id uuid null,
add column if not exists generation_intent text null;

alter table public.generation_jobs
drop constraint if exists generation_jobs_track_version_id_fkey;

alter table public.generation_jobs
add constraint generation_jobs_track_version_id_fkey
foreign key (track_version_id)
references public.track_versions(id)
on delete set null;

alter table public.generation_jobs
drop constraint if exists generation_jobs_parent_version_id_fkey;

alter table public.generation_jobs
add constraint generation_jobs_parent_version_id_fkey
foreign key (parent_version_id)
references public.track_versions(id)
on delete set null;

create index if not exists track_versions_track_group_idx
on public.track_versions(track_group_id);

create index if not exists track_versions_generation_job_idx
on public.track_versions(generation_job_id);

create unique index if not exists track_versions_generation_job_unique_idx
on public.track_versions(generation_job_id)
where generation_job_id is not null;

alter table public.track_versions
drop constraint if exists track_versions_track_group_version_number_key;

alter table public.track_versions
add constraint track_versions_track_group_version_number_key
unique (track_group_id, version_number);

alter table public.track_versions enable row level security;

do $$
begin
  if to_regprocedure('public.set_generation_jobs_updated_at()') is not null then
    drop trigger if exists track_versions_set_updated_at on public.track_versions;
    create trigger track_versions_set_updated_at
    before update on public.track_versions
    for each row
    execute function public.set_generation_jobs_updated_at();
  end if;
end $$;
