alter table if exists public.generation_jobs
add column if not exists estimated_cost_credits numeric null,
add column if not exists actual_cost_credits numeric null,
add column if not exists cost_metadata jsonb not null default '{}'::jsonb;

alter table if exists public.track_versions
add column if not exists generation_metadata jsonb not null default '{}'::jsonb;
