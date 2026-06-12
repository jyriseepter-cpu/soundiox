create extension if not exists pgcrypto;

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  title text null,
  prompt text null,
  vocal_mode text null,
  provider text not null,
  status text not null default 'starting',
  audio_url text null,
  error text null,
  client_generation_token text null,
  session_key text null,
  request_hash text null,
  provider_job_id text null,
  provider_status text null,
  storage_path text null,
  generation_mode text null,
  generation_intent text null,
  duration_seconds integer null,
  parent_version_id uuid null,
  started_at timestamptz null,
  completed_at timestamptz null,
  failed_at timestamptz null,
  cancelled_at timestamptz null,
  locked_until timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.generation_jobs
alter column user_id drop not null;

alter table public.generation_jobs
add column if not exists user_id uuid null,
add column if not exists title text null,
add column if not exists prompt text null,
add column if not exists vocal_mode text null,
add column if not exists provider text not null default 'replicate',
add column if not exists status text not null default 'starting',
add column if not exists audio_url text null,
add column if not exists error text null,
add column if not exists client_generation_token text null,
add column if not exists session_key text null,
add column if not exists request_hash text null,
add column if not exists provider_job_id text null,
add column if not exists provider_status text null,
add column if not exists storage_path text null,
add column if not exists generation_mode text null,
add column if not exists generation_intent text null,
add column if not exists duration_seconds integer null,
add column if not exists parent_version_id uuid null,
add column if not exists started_at timestamptz null,
add column if not exists completed_at timestamptz null,
add column if not exists failed_at timestamptz null,
add column if not exists cancelled_at timestamptz null,
add column if not exists locked_until timestamptz null,
add column if not exists track_group_id uuid null,
add column if not exists track_version_id uuid null,
add column if not exists created_at timestamptz not null default now(),
add column if not exists updated_at timestamptz not null default now();

alter table public.generation_jobs
alter column provider set not null,
alter column provider set default 'replicate',
alter column status set not null,
alter column status set default 'starting',
alter column created_at set not null,
alter column created_at set default now(),
alter column updated_at set not null,
alter column updated_at set default now();

alter table public.generation_jobs enable row level security;

do $$
begin
  if to_regprocedure('public.set_generation_jobs_updated_at()') is not null then
    drop trigger if exists generation_jobs_set_updated_at on public.generation_jobs;
    create trigger generation_jobs_set_updated_at
    before update on public.generation_jobs
    for each row
    execute function public.set_generation_jobs_updated_at();
  end if;
end $$;

create unique index if not exists generation_jobs_client_generation_token_key
on public.generation_jobs(client_generation_token)
where client_generation_token is not null;

create index if not exists generation_jobs_provider_job_id_idx
on public.generation_jobs(provider_job_id)
where provider_job_id is not null;

create index if not exists generation_jobs_session_status_idx
on public.generation_jobs(session_key, status)
where session_key is not null;

create unique index if not exists generation_jobs_active_session_request_key
on public.generation_jobs(session_key, request_hash, provider)
where session_key is not null
  and request_hash is not null
  and status in ('starting', 'queued', 'running');
