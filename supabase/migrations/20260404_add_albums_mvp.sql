create extension if not exists pgcrypto;

create table if not exists public.albums (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text null,
  artwork_url text null,
  genre text null,
  release_date date null,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.tracks
add column if not exists album_id uuid null references public.albums(id) on delete set null;

alter table public.tracks
add column if not exists track_number integer null;

create index if not exists albums_user_id_idx on public.albums(user_id);
create index if not exists tracks_album_id_idx on public.tracks(album_id);

alter table public.albums enable row level security;

drop policy if exists "albums_select_published_or_owner" on public.albums;
create policy "albums_select_published_or_owner"
on public.albums
for select
using (
  is_published = true
  or auth.uid() = user_id
);

drop policy if exists "albums_insert_own" on public.albums;
create policy "albums_insert_own"
on public.albums
for insert
with check (
  auth.uid() = user_id
);

drop policy if exists "albums_update_own" on public.albums;
create policy "albums_update_own"
on public.albums
for update
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
);

drop policy if exists "albums_delete_own" on public.albums;
create policy "albums_delete_own"
on public.albums
for delete
using (
  auth.uid() = user_id
);
