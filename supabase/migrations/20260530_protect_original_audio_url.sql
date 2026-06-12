create or replace function public.prevent_original_audio_url_update()
returns trigger
language plpgsql
as $$
begin
  if old.is_original = true and new.audio_url is distinct from old.audio_url then
    raise exception 'Original track_versions.audio_url is immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_original_audio_url on public.track_versions;

create trigger protect_original_audio_url
before update of audio_url on public.track_versions
for each row
execute function public.prevent_original_audio_url_update();
