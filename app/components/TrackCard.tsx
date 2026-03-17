"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { usePlayer } from "@/app/components/PlayerContext";
import type { Track } from "@/app/components/PlayerContext";

type Props = {
  track: Track;
  allTracks?: Track[];
  onPlay?: () => void;
};

function getTitle(track: Track) {
  const t = track as any;
  return (t.title ?? t.name ?? "Untitled").toString();
}

function getArtist(track: Track) {
  const t = track as any;
  return (
    t.artistDisplayName ??
    t.displayArtist ??
    t.artist ??
    "AI Artist"
  ).toString();
}

function getGenre(track: Track) {
  const t = track as any;
  return (t.genre ?? "").toString();
}

function getImage(track: Track) {
  const t = track as any;
  return (
    t.artistAvatarUrl ??
    t.avatar_url ??
    t.artwork_url ??
    t.image_url ??
    t.cover_url ??
    "/logo-new.png"
  ).toString();
}

function isSameTrack(a?: Track | null, b?: Track | null) {
  if (!a || !b) return false;

  const ta = a as any;
  const tb = b as any;

  if (ta.id && tb.id) return ta.id === tb.id;

  const aSrc = (ta.audio_url ?? ta.src ?? "").toString();
  const bSrc = (tb.audio_url ?? tb.src ?? "").toString();

  return Boolean(aSrc) && aSrc === bSrc;
}

export default function TrackCard({
  track,
  allTracks = [],
  onPlay,
}: Props) {
  const { currentTrack, isPlaying, playTrack, toggle } = usePlayer();

  const t = track as any;
  const active = isSameTrack(currentTrack, track);
  const showPause = active && isPlaying;

  const artistSlug = useMemo(() => {
    const raw = t.artistSlug;
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
  }, [t.artistSlug]);

  function handlePlayClick() {
    if (active) {
      toggle();
      return;
    }

    if (onPlay) {
      onPlay();
      return;
    }

    playTrack(track, allTracks.length ? allTracks : [track]);
  }

  return (
    <div
      className={`flex items-center justify-between rounded-2xl px-4 py-3 ring-1 transition ${
        active
          ? "bg-gradient-to-r from-purple-500/15 to-fuchsia-500/15 ring-purple-400/40"
          : "bg-white/8 ring-white/10"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`relative h-14 w-14 overflow-hidden rounded-2xl ring-1 transition ${
            active
              ? "bg-gradient-to-br from-purple-500/20 to-fuchsia-500/20 ring-purple-400/50 shadow-[0_0_24px_rgba(168,85,247,0.28)]"
              : "bg-white/10 ring-white/10"
          }`}
        >
          <Image
            src={getImage(track)}
            alt={getTitle(track)}
            fill
            className="object-cover"
            sizes="56px"
          />

          {active ? (
            <div className="pointer-events-none absolute inset-0 rounded-2xl border border-white/10" />
          ) : null}
        </div>

        <div className="min-w-0">
          <div className="truncate text-lg font-bold text-white">
            {getTitle(track)}
          </div>

          <div className="truncate text-sm font-medium text-white/80">
            {artistSlug ? (
              <Link
                href={`/artists/${encodeURIComponent(artistSlug)}`}
                className="cursor-pointer transition hover:text-cyan-300"
              >
                {getArtist(track)}
              </Link>
            ) : (
              <span>{getArtist(track)}</span>
            )}

            {getGenre(track) ? ` • ${getGenre(track)}` : ""}
          </div>
        </div>
      </div>

      <div className="ml-4 flex items-center gap-2">
        <button
          type="button"
          className="rounded-xl bg-gradient-to-r from-cyan-300 to-cyan-400 px-4 py-2 text-base font-semibold text-white transition hover:opacity-90"
        >
          Add
        </button>

        <button
          type="button"
          onClick={handlePlayClick}
          className="rounded-xl bg-gradient-to-r from-purple-500 to-fuchsia-500 px-4 py-2 text-base font-semibold text-white transition hover:opacity-90"
        >
          {showPause ? "Pause" : "Play"}
        </button>
      </div>
    </div>
  );
}