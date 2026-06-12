alter table public.tracks
add column if not exists ready_for_review boolean not null default false,
add column if not exists review_requested_at timestamptz null;
