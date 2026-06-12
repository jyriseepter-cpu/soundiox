alter table public.tracks
add column if not exists review_status text not null default 'draft',
add column if not exists reviewed_at timestamptz null,
add column if not exists review_note text null;
