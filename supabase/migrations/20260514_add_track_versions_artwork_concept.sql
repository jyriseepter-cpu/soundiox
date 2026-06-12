alter table public.track_versions
add column if not exists artwork_concept jsonb null;
