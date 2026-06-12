alter table public.track_versions
add column if not exists imported_source text null,
add column if not exists source_filename text null,
add column if not exists import_metadata jsonb null;

alter table public.tracks
add column if not exists source_track_version_id uuid null,
add column if not exists source_track_group_id uuid null,
add column if not exists source_generation_mode text null,
add column if not exists source_provider text null,
add column if not exists source_version_label text null,
add column if not exists source_version_note text null,
add column if not exists imported_source text null,
add column if not exists source_filename text null,
add column if not exists import_metadata jsonb null,
add column if not exists artwork_concept jsonb null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tracks_source_track_version_id_fkey'
      and conrelid = 'public.tracks'::regclass
  ) then
    alter table public.tracks
    add constraint tracks_source_track_version_id_fkey
    foreign key (source_track_version_id)
    references public.track_versions(id)
    on delete set null;
  end if;
end $$;

create index if not exists tracks_source_track_group_id_idx
on public.tracks(source_track_group_id)
where source_track_group_id is not null;

create index if not exists tracks_source_track_version_id_idx
on public.tracks(source_track_version_id)
where source_track_version_id is not null;
