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
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[rgba(7,10,20,0.9)] shadow-[0_-8px_30px_rgba(0,0,0,0.6)] backdrop-blur-xl lg:bottom-[5mm]">
      <div
        className="mx-auto max-w-6xl px-4 py-1 lg:py-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.2rem)" }}
      >
        <div className="flex flex-col gap-0.5 md:flex-row md:items-center md:gap-2 lg:gap-4">
          <div className="min-w-0 md:flex-1">
            <div className="truncate text-[11px] font-semibold leading-tight text-white lg:text-sm">
              {title}
            </div>
            <div className="truncate text-[9px] leading-tight text-white/70 lg:text-xs">
              {artist}
            </div>
          </div>

          <div className="flex items-center justify-between gap-1 sm:justify-start lg:gap-2">
            <button
              onClick={prev}
              className="rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-white ring-1 ring-white/10 hover:bg-white/15 lg:rounded-xl lg:px-3 lg:py-2 lg:text-sm"
              aria-label="Previous"
              type="button"
            >
              ◀
            </button>

            <button
              onClick={toggle}
              className="min-w-[50px] rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white ring-1 ring-white/10 hover:bg-white/15 lg:min-w-[84px] lg:rounded-xl lg:px-4 lg:py-2 lg:text-sm"
              aria-label={isPlaying ? "Pause" : "Play"}
              type="button"
            >
              {isPlaying ? "Pause" : "Play"}
            </button>

            <button
              onClick={next}
              className="rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-white ring-1 ring-white/10 hover:bg-white/15 lg:rounded-xl lg:px-3 lg:py-2 lg:text-sm"
              aria-label="Next"
              type="button"
            >
              ▶
            </button>
          </div>

          <div className="flex items-center gap-1 lg:gap-3">
            <div className="w-7 text-right text-[8px] leading-none text-white/70 lg:w-12 lg:text-xs">
              {formatTime(currentTime ?? 0)}
            </div>

            <div
              className="relative h-1 flex-1 cursor-pointer rounded-full bg-white/10 lg:h-2 lg:w-64 lg:flex-none"
              onClick={onSeekBarClick}
              role="slider"
              aria-label="Seek"
            >
              <div
                className="absolute left-0 top-0 h-1 rounded-full bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500 lg:h-2"
                style={{ width: `${progress}%` }}
              />
              <div
                className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-white lg:h-3 lg:w-3"
                style={{ left: `calc(${progress}% - 4px)` }}
              />
            </div>

            <div className="w-7 text-[8px] leading-none text-white/70 lg:w-12 lg:text-xs">
              {formatTime(duration ?? 0)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
