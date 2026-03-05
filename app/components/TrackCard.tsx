"use client";

import React from "react";
import type { Track } from "@/app/components/PlayerContext";

type Props = {
  track: Track;
  allTracks: Track[];
  onPlay: (t: Track, all: Track[]) => void;
  onAdd?: (t: Track) => void;
};

function pickTitle(t: Track) {
  return (t.title ?? (t as any).name ?? "Untitled").toString();
}
function pickArtist(t: Track) {
  return (t.artist ?? "AI Artist").toString();
}

export default function TrackCard({ track, allTracks, onPlay, onAdd }: Props) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-3 py-3 ring-1 ring-white/10">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-white/90">{pickTitle(track)}</div>
        <div className="truncate text-xs text-white/60">{pickArtist(track)}</div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onAdd?.(track)}
          className="h-9 rounded-xl bg-white/10 px-3 text-sm font-semibold text-white ring-1 ring-white/10"
        >
          Add
        </button>

        <button
          onClick={() => onPlay(track, allTracks)}
          className="h-9 rounded-xl bg-gradient-to-r from-emerald-400/80 to-fuchsia-500/80 px-3 text-sm font-semibold text-white"
        >
          Play
        </button>
      </div>
    </div>
  );
}