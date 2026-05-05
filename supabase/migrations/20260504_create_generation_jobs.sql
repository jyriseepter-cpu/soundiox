create extension if not exists pgcrypto;

create or replace function public.set_generation_jobs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text null,
  prompt text null,
  style text null,
  mood text null,
  lyrics text null,
  vocal_mode text null,
  artwork_prompt text null,
  provider text not null default 'runpod',
  status text not null default 'queued',
  audio_url text null,
  artwork_url text null,
  error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists generation_jobs_user_id_idx
  on public.generation_jobs(user_id);

create index if not exists generation_jobs_status_idx
  on public.generation_jobs(status);

drop trigger if exists generation_jobs_set_updated_at on public.generation_jobs;
create trigger generation_jobs_set_updated_at
before update on public.generation_jobs
for each row
execute function public.set_generation_jobs_updated_at();

alter table public.generation_jobs enable row level security;

drop policy if exists "generation_jobs_select_own" on public.generation_jobs;
create policy "generation_jobs_select_own"
on public.generation_jobs
for select
using (
  auth.uid() = user_id
);

drop policy if exists "generation_jobs_insert_own" on public.generation_jobs;
create policy "generation_jobs_insert_own"
on public.generation_jobs
for insert
with check (
  auth.uid() = user_id
);

drop policy if exists "generation_jobs_update_own_draft" on public.generation_jobs;
create policy "generation_jobs_update_own_draft"
on public.generation_jobs
for update
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
  and status in ('draft', 'queued', 'failed')
);

drop policy if exists "generation_jobs_service_role_update" on public.generation_jobs;
create policy "generation_jobs_service_role_update"
on public.generation_jobs
for update
using (
  auth.role() = 'service_role'
)
with check (
  auth.role() = 'service_role'
);
