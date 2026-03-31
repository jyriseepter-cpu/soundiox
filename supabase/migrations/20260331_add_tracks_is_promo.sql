alter table public.tracks
add column if not exists is_promo boolean default false;
