"use client";

import Image from "next/image";
import { useMemo } from "react";
import { usePlayer } from "@/app/components/PlayerContext";

type Track = {
  id: string;
  title?: string | null;
  artist?: string | null;
  genre?: string | null;
  artwork_url?: string | null;
  created_at?: string | null;
  plays_all_time?: number | null;
  likes_this_month?: number | null;
};

type Props = {
  track: Track;
  allTracks: Track[];
};

function getHoursSince(date?: string | null) {
  if (!date) return 999;
  return (Date.now() - new Date(date).getTime()) / 36e5;
}

function getPlays(plays?: number | null, created?: string | null) {
  if (getHoursSince(created) < 5) return "🔥";
  return plays ?? 0;
}

export default function TrackCard({ track, allTracks }: Props) {
  const { playTrack, currentTrack, isPlaying, toggle } = usePlayer();
  const isCurrent = currentTrack?.id === track.id;

  function handlePlay() {
    if (isCurrent) return toggle();
    playTrack(track as any, allTracks as any);
  }

  const plays = useMemo(
    () => getPlays(track.plays_all_time, track.created_at),
    [track.plays_all_time, track.created_at]
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">

      {/* TOP ROW */}
      <div className="flex gap-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl">
          <Image
            src={track.artwork_url || "/logo-new.png"}
            alt=""
            fill
            className="object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-white">
            {track.title}
          </div>

          <div className="truncate text-sm text-white/70">
            {track.artist} • {track.genre}
          </div>

          <div className="mt-1 text-xs text-white/50">
            Plays: {plays}
          </div>
        </div>
      </div>

      {/* BUTTON ROW — ERALDI */}
      <div className="mt-4 flex gap-2 flex-wrap">
        <button className="px-3 py-2 rounded-lg bg-white/10">Following</button>
        <button className="px-3 py-2 rounded-lg bg-white/10">Share</button>
        <button className="px-3 py-2 rounded-lg bg-cyan-500">Add</button>

        <button
          onClick={handlePlay}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-400 to-fuchsia-500"
        >
          {isCurrent && isPlaying ? "Pause" : "Play"}
        </button>
      </div>

    </div>
  );
}