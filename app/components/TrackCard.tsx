"use client";

import React from "react";
import Image from "next/image";
import { usePlayer, Track } from "./PlayerContext";

function pickTitle(t: Track) {
  return (t.title ?? t.name ?? "Untitled").toString();
}

function pickSubtitle(t: Track) {
  const a = (t.artist ?? "AI Artist").toString();
  const g = (t.genre ?? "").toString();
  return g ? `${a} • ${g}` : a;
}

function pickCover(t: Track) {
  return (t.cover_url || t.image_url || t.artwork_url || "/art/ns.jpg").toString();
}

export default function TrackCard({
  track,
  allTracks,
}: {
  track: Track;
  allTracks: Track[];
}) {
  const { playTrack, currentTrack, isPlaying } = usePlayer();

  const active = currentTrack && String(currentTrack.id) === String(track.id);
  const label = active && isPlaying ? "Pause" : "Play";

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-white/10">
          <Image src={pickCover(track)} alt={pickTitle(track)} fill className="object-cover" />
        </div>

        <div className="min-w-0">
          <div className="text-white font-semibold truncate">{pickTitle(track)}</div>
          <div className="text-white/60 text-xs truncate">{pickSubtitle(track)}</div>
        </div>
      </div>

      {/* SEE on kriitiline: Play nupp kutsub playTrack(track, allTracks) */}
      <button
        onClick={() => playTrack(track, allTracks)}
        className={[
          "shrink-0 rounded-xl px-4 py-2 text-sm font-semibold",
          "border border-white/15",
          active ? "bg-white/15" : "bg-white/10 hover:bg-white/15",
          "text-white",
        ].join(" ")}
      >
        {label}
      </button>
    </div>
  );
}