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
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[rgba(7,10,20,0.9)] shadow-[0_-8px_30px_rgba(0,0,0,0.6)] backdrop-blur-xl md:bottom-[5mm]">
      <div
        className="mx-auto max-w-6xl px-4 py-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
          <div className="min-w-0 md:flex-1">
            <div className="truncate text-sm font-semibold text-white">
              {title}
            </div>
            <div className="truncate text-xs text-white/70">{artist}</div>
          </div>

          <div className="flex items-center justify-between gap-2 sm:justify-start">
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
              className="min-w-[84px] rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/10 hover:bg-white/15"
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

          <div className="flex items-center gap-3">
            <div className="w-10 text-right text-[11px] text-white/70 md:w-12 md:text-xs">
              {formatTime(currentTime ?? 0)}
            </div>

            <div
              className="relative h-2 flex-1 cursor-pointer rounded-full bg-white/10 md:w-64 md:flex-none"
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

            <div className="w-10 text-[11px] text-white/70 md:w-12 md:text-xs">
              {formatTime(duration ?? 0)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
