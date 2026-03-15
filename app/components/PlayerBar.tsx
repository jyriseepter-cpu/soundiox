"use client";

import React from "react";
import { usePlayer } from "@/app/components/PlayerContext";

function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function PlayerBar() {
  const {
    currentTrack,
    isPlaying,
    toggle,
    next,
    prev,
    currentTime,
    duration,
    seek,
  } = usePlayer() as any;

  const title = currentTrack?.title ?? "No track selected";
  const artist =
    currentTrack?.artistDisplayName ?? currentTrack?.artist ?? "AI Artist";

  const progress =
    duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const onSeekBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    seek(ratio * duration);
  };

  return (
    <div className="fixed left-0 right-0 z-50 bottom-0 md:bottom-[5mm] border-t border-white/10 bg-[rgba(7,10,20,0.9)] shadow-[0_-8px_30px_rgba(0,0,0,0.6)] backdrop-blur-xl">
      <div
        className="mx-auto max-w-6xl px-4 py-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
      >
        <div className="flex items-center gap-3 md:gap-4">
          {/* LEFT: track meta */}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">
              {title}
            </div>
            <div className="truncate text-xs text-white/70">{artist}</div>
          </div>

          {/* CONTROLS */}
          <div className="flex items-center gap-2">
            <button
              onClick={prev}
              className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/10 hover:bg-white/15"
              aria-label="Previous"
              type="button"
            >
              ◀
            </button>

            <button
              onClick={toggle}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/10 hover:bg-white/15"
              aria-label={isPlaying ? "Pause" : "Play"}
              type="button"
            >
              {isPlaying ? "Pause" : "Play"}
            </button>

            <button
              onClick={next}
              className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/10 hover:bg-white/15"
              aria-label="Next"
              type="button"
            >
              ▶
            </button>
          </div>

          {/* TIME + SEEK */}
          <div className="hidden items-center gap-3 md:flex">
            <div className="w-12 text-right text-xs text-white/70">
              {formatTime(currentTime ?? 0)}
            </div>

            <div
              className="relative h-2 w-64 cursor-pointer rounded-full bg-white/10"
              onClick={onSeekBarClick}
              role="slider"
              aria-label="Seek"
            >
              <div
                className="absolute left-0 top-0 h-2 rounded-full bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500"
                style={{ width: `${progress}%` }}
              />
              <div
                className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white"
                style={{ left: `calc(${progress}% - 6px)` }}
              />
            </div>

            <div className="w-12 text-xs text-white/70">
              {formatTime(duration ?? 0)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
