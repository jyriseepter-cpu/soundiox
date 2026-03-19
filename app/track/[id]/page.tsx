"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { usePlayer } from "@/app/components/PlayerContext";

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
  is_published: boolean | null;
  user_id: string | null;
};

export default function TrackPage() {
  const params = useParams();
  const { playTrack } = usePlayer();

  const id = typeof params?.id === "string" ? params.id : "";

  const [track, setTrack] = useState<TrackRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function loadTrack() {
      if (!id) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const { data, error } = await supabase
          .from("tracks")
          .select(
            "id,title,artist,genre,audio_url,artwork_url,created_at,plays_all_time,plays_this_month,is_published,user_id"
          )
          .eq("id", id)
          .eq("is_published", true)
          .maybeSingle();

        if (error) throw error;
        if (!alive) return;

        setTrack((data as TrackRow | null) ?? null);
      } catch (error) {
        console.warn("track page load warning:", error);
        if (!alive) return;
        setTrack(null);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    void loadTrack();

    return () => {
      alive = false;
    };
  }, [id]);

  function handlePlay() {
    if (!track) return;
    void playTrack(track as any, [track] as any);
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-8">
        <div className="rounded-2xl bg-white/8 p-6 text-white/70 ring-1 ring-white/10">
          Loading track...
        </div>
      </div>
    );
  }

  if (!track) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-8">
        <div className="rounded-2xl bg-white/8 p-6 ring-1 ring-white/10">
          <div className="text-xl font-bold text-white">Track not found</div>
          <div className="mt-2 text-sm text-white/65">
            This track does not exist or is not published.
          </div>

          <Link
            href="/discover"
            className="mt-4 inline-flex rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/15"
          >
            Back to Discover
          </Link>
        </div>
      </div>
    );
  }

  const title = track.title ?? "Untitled";
  const artist = track.artist ?? "AI Artist";
  const genre = track.genre ?? "";
  const artwork = track.artwork_url || "/logo-new.png";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-8">
      <div className="overflow-hidden rounded-3xl bg-white/8 ring-1 ring-white/10">
        <div className="flex flex-col gap-6 p-6 md:flex-row">
          <img
            src={artwork}
            alt={title}
            className="h-56 w-full rounded-2xl object-cover ring-1 ring-white/10 md:h-72 md:w-72"
          />

          <div className="flex min-w-0 flex-1 flex-col justify-between">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300/80">
                Track
              </div>

              <h1 className="mt-2 text-3xl font-bold text-white md:text-4xl">
                {title}
              </h1>

              <div className="mt-2 text-lg font-medium text-white/80">
                {artist}
                {genre ? ` • ${genre}` : ""}
              </div>

              <div className="mt-4 text-sm text-white/55">
                All-time plays: {track.plays_all_time ?? 0}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handlePlay}
                className="rounded-xl bg-gradient-to-r from-purple-500 to-fuchsia-500 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Play
              </button>

              <Link
                href="/discover"
                className="rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/15"
              >
                Back to Discover
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}