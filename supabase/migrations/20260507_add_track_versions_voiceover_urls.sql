alter table public.track_versions
add column if not exists vocal_url text null,
add column if not exists voiceover_url text null;
