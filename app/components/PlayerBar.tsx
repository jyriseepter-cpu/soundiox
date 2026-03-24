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
        className="mx-auto max-w-6xl px-4 py-1.5 md:py-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.35rem)" }}
      >
        <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:gap-4">
          <div className="min-w-0 md:flex-1">
            <div className="truncate text-[13px] font-semibold text-white md:text-sm">
              {title}
            </div>
            <div className="truncate text-[11px] text-white/70 md:text-xs">{artist}</div>
          </div>

          <div className="flex items-center justify-between gap-1.5 sm:justify-start md:gap-2">
            <button
              onClick={prev}
              className="rounded-lg bg-white/10 px-2.5 py-1 text-[13px] font-semibold text-white ring-1 ring-white/10 hover:bg-white/15 md:rounded-xl md:px-3 md:py-2 md:text-sm"
              aria-label="Previous"
              type="button"
            >
              ◀
            </button>

            <button
              onClick={toggle}
              className="min-w-[68px] rounded-lg bg-white/10 px-3 py-1 text-[13px] font-semibold text-white ring-1 ring-white/10 hover:bg-white/15 md:min-w-[84px] md:rounded-xl md:px-4 md:py-2 md:text-sm"
              aria-label={isPlaying ? "Pause" : "Play"}
              type="button"
            >
              {isPlaying ? "Pause" : "Play"}
            </button>

            <button
              onClick={next}
              className="rounded-lg bg-white/10 px-2.5 py-1 text-[13px] font-semibold text-white ring-1 ring-white/10 hover:bg-white/15 md:rounded-xl md:px-3 md:py-2 md:text-sm"
              aria-label="Next"
              type="button"
            >
              ▶
            </button>
          </div>

          <div className="flex items-center gap-1.5 md:gap-3">
            <div className="w-9 text-right text-[10px] text-white/70 md:w-12 md:text-xs">
              {formatTime(currentTime ?? 0)}
            </div>

            <div
              className="relative h-1.5 flex-1 cursor-pointer rounded-full bg-white/10 md:h-2 md:w-64 md:flex-none"
              onClick={onSeekBarClick}
              role="slider"
              aria-label="Seek"
            >
              <div
                className="absolute left-0 top-0 h-1.5 rounded-full bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500 md:h-2"
                style={{ width: `${progress}%` }}
              />
              <div
                className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-white md:h-3 md:w-3"
                style={{ left: `calc(${progress}% - 5px)` }}
              />
            </div>

            <div className="w-9 text-[10px] text-white/70 md:w-12 md:text-xs">
              {formatTime(duration ?? 0)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
