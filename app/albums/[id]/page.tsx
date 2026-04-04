"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { usePlayer } from "@/app/components/PlayerContext";

type AlbumRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  artwork_url: string | null;
  genre: string | null;
  release_date: string | null;
  is_published: boolean | null;
  created_at: string | null;
};

type TrackRow = {
  id: string;
  title: string | null;
  artist: string | null;
  genre: string | null;
  audio_url: string | null;
  artwork_url: string | null;
  created_at: string | null;
  plays_all_time: number | null;
  plays_this_month: number | null;
  user_id: string | null;
  album_id: string | null;
  track_number: number | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  slug: string | null;
};

function formatReleaseDate(dateStr?: string | null) {
  if (!dateStr) return "Unscheduled";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "Unscheduled";
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function AlbumDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { playTrack, currentTrack, isPlaying, toggle } = usePlayer();
  const albumId = String(params?.id || "");

  const [loading, setLoading] = useState(true);
  const [album, setAlbum] = useState<AlbumRow | null>(null);
  const [artist, setArtist] = useState<ProfileRow | null>(null);
  const [tracks, setTracks] = useState<TrackRow[]>([]);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setNotFound(false);

      const { data: albumData, error: albumErr } = await supabase
        .from("albums")
        .select(
          "id,user_id,title,description,artwork_url,genre,release_date,is_published,created_at"
        )
        .eq("id", albumId)
        .eq("is_published", true)
        .maybeSingle<AlbumRow>();

      if (albumErr) {
        console.error("album load error:", albumErr);
      }
      if (cancelled) return;

      if (!albumData) {
        setAlbum(null);
        setArtist(null);
        setTracks([]);
        setNotFound(true);
        setLoading(false);
        return;
      }

      setAlbum(albumData);

      const [{ data: artistData, error: artistErr }, { data: trackData, error: trackErr }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("id,display_name,slug")
            .eq("id", albumData.user_id)
            .maybeSingle<ProfileRow>(),
          supabase
            .from("tracks")
            .select(
              "id,title,artist,genre,audio_url,artwork_url,created_at,plays_all_time,plays_this_month,user_id,album_id,track_number"
            )
            .eq("album_id", albumData.id)
            .eq("is_published", true)
            .order("track_number", { ascending: true, nullsFirst: false })
            .order("created_at", { ascending: true }),
        ]);

      if (artistErr) {
        console.error("album artist load error:", artistErr);
      }
      if (trackErr) {
        console.error("album tracks load error:", trackErr);
      }
      if (cancelled) return;

      setArtist((artistData as ProfileRow) ?? null);
      setTracks(((trackData ?? []) as TrackRow[]) ?? []);
      setLoading(false);
    }

    if (albumId) {
      void load();
    }

    return () => {
      cancelled = true;
    };
  }, [albumId]);

  const totalPlays = useMemo(
    () => tracks.reduce((sum, track) => sum + (track.plays_all_time ?? 0), 0),
    [tracks]
  );

  const currentAlbumTrack = useMemo(() => {
    if (!currentTrack?.id) return null;
    return tracks.find((track) => String(track.id) === String(currentTrack.id)) ?? null;
  }, [currentTrack?.id, tracks]);

  if (!loading && notFound) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-8">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-xl">
          <div className="text-2xl font-semibold text-white">Album not found</div>
          <div className="mt-2 text-sm text-white/65">
            This album could not be loaded from the current release ID.
          </div>
          <button
            onClick={() => router.push("/artists")}
            className="mt-5 h-10 rounded-xl bg-white/10 px-4 text-sm font-medium text-white hover:bg-white/15"
          >
            Browse artists
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-8">
      <div className="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur-xl">
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="relative aspect-square w-full max-w-[320px] overflow-hidden rounded-[28px] border border-white/10 bg-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
            {album?.artwork_url ? (
              <Image
                src={album.artwork_url}
                alt={album.title || "Album cover"}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 320px"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-7xl text-white/30">
                ♪
              </div>
            )}
          </div>

          <div className="flex-1">
            <div className="text-xs font-semibold tracking-[0.22em] text-cyan-200/80">
              ALBUM
            </div>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">
              {loading ? "Loading..." : album?.title || "Untitled album"}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-white/70">
              {artist?.slug ? (
                <Link
                  href={`/artists/${encodeURIComponent(artist.slug)}`}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 hover:bg-white/10"
                >
                  {artist.display_name || "Artist"}
                </Link>
              ) : (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  {artist?.display_name || "Artist"}
                </span>
              )}

              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                {(album?.genre || "").trim() || "—"}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                {formatReleaseDate(album?.release_date)}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                {tracks.length} track{tracks.length === 1 ? "" : "s"}
              </span>
            </div>

            {album?.description ? (
              <p className="mt-5 max-w-3xl text-sm leading-7 text-white/72">
                {album.description}
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  if (!tracks.length) return;

                  if (currentAlbumTrack) {
                    void toggle();
                    return;
                  }

                  void playTrack(tracks[0] as any, tracks as any);
                }}
                disabled={!tracks.length}
                className="rounded-2xl bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {currentAlbumTrack && isPlaying ? "Pause Album" : "Play Album"}
              </button>

              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
                {totalPlays} total plays across this release
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-white">Track list</div>
          <div className="text-xs text-white/60">
            Ordered by track number
          </div>
        </div>

        {tracks.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-white/70">
            No tracks are attached to this album yet.
          </div>
        ) : (
          <div className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10">
            {tracks.map((track, index) => {
              const isCurrentTrack =
                currentTrack?.id && String(currentTrack.id) === String(track.id);

              return (
                <div
                  key={track.id}
                  className="flex items-center justify-between gap-3 bg-black/20 p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-white/70">
                      {track.track_number ?? index + 1}
                    </div>

                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">
                        {track.title || `Track ${index + 1}`}
                      </div>
                      <div className="truncate text-xs text-white/60">
                        {(track.genre || "").trim() || "—"} • {track.plays_this_month ?? 0} plays this month
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (isCurrentTrack) {
                        void toggle();
                        return;
                      }

                      void playTrack(track as any, tracks as any);
                    }}
                    className="h-9 rounded-xl bg-white/10 px-4 text-sm font-medium text-white hover:bg-white/15"
                  >
                    {isCurrentTrack && isPlaying ? "Pause" : "Play"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
