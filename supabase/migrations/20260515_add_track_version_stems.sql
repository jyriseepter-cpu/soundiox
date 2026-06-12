alter table public.track_versions
add column if not exists stems_status text not null default 'not_started',
add column if not exists stems_requested_at timestamptz null,
add column if not exists stems_completed_at timestamptz null,
add column if not exists stems_error text null,
add column if not exists stem_drums_url text null,
add column if not exists stem_bass_url text null,
add column if not exists stem_vocals_url text null,
add column if not exists stem_other_url text null,
add column if not exists stems_metadata jsonb null;

create index if not exists track_versions_stems_status_idx
on public.track_versions(stems_status);
