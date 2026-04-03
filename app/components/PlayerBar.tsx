"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { normalizeAccessPlan } from "@/lib/lifetimeCampaign";
import { usePlayer } from "@/app/components/PlayerContext";
import {
  addTrackToPlaylist,
  broadcastTrackLikeChanged,
  fetchUserLikedTrackIds,
  fetchUserPlaylists,
  likeTrack,
  unlikeTrack,
  type UserPlaylist,
} from "@/lib/trackEngagement";

function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function normalizeRole(value: string | null | undefined) {
  return value === "artist" ? "artist" : "listener";
}

export default function PlayerBar() {
  const {
    currentTrack,
    isPlaying,
    isShuffleEnabled,
    toggle,
    next,
    prev,
    currentTime,
    duration,
    seek,
    shuffleQueue,
  } = usePlayer() as any;

  const [viewerLoggedIn, setViewerLoggedIn] = useState(false);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [viewerRole, setViewerRole] = useState<"listener" | "artist">("listener");
  const [viewerPlan, setViewerPlan] = useState<
    "free" | "premium" | "artist" | "lifetime"
  >("free");
  const [viewerIsFounding, setViewerIsFounding] = useState(false);
  const [likedTrackIds, setLikedTrackIds] = useState<string[]>([]);
  const [likeLoading, setLikeLoading] = useState(false);
  const [playlists, setPlaylists] = useState<UserPlaylist[]>([]);
  const [playlistMenuOpen, setPlaylistMenuOpen] = useState(false);
  const [addingPlaylistId, setAddingPlaylistId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const title = currentTrack?.title ?? "No track selected";
  const artist =
    currentTrack?.artistDisplayName ?? currentTrack?.artist ?? "AI Artist";
  const currentTrackId =
    typeof currentTrack?.id === "string" || typeof currentTrack?.id === "number"
      ? String(currentTrack.id)
      : "";

  const progress =
    duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const viewerCanLike =
    viewerIsFounding ||
    viewerRole === "artist" ||
    viewerPlan === "premium" ||
    viewerPlan === "artist" ||
    viewerPlan === "lifetime";

  const isLiked = currentTrackId ? likedTrackIds.includes(currentTrackId) : false;
  const transportDisabled = !currentTrack;

  useEffect(() => {
    let alive = true;

    async function loadViewerState() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;

        if (!user?.id) {
          if (!alive) return;
          setViewerLoggedIn(false);
          setViewerUserId(null);
          setViewerRole("listener");
          setViewerPlan("free");
          setViewerIsFounding(false);
          setLikedTrackIds([]);
          setPlaylists([]);
          return;
        }

        if (!alive) return;

        setViewerLoggedIn(true);
        setViewerUserId(user.id);

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("plan, is_founding, role")
          .eq("id", user.id)
          .maybeSingle<{ plan: string | null; is_founding: boolean | null; role: string | null }>();

        if (profileError) throw profileError;
        if (!alive) return;

        setViewerRole(normalizeRole(profile?.role));
        setViewerPlan(normalizeAccessPlan(profile?.plan));
        setViewerIsFounding(Boolean(profile?.is_founding));

        const [nextLikedTrackIds, nextPlaylists] = await Promise.all([
          fetchUserLikedTrackIds(user.id),
          fetchUserPlaylists(user.id),
        ]);

        if (!alive) return;
        setLikedTrackIds(nextLikedTrackIds);
        setPlaylists(nextPlaylists);
      } catch (error) {
        console.warn("player bar viewer state warning:", error);
        if (!alive) return;
        setViewerLoggedIn(false);
        setViewerUserId(null);
        setViewerRole("listener");
        setViewerPlan("free");
        setViewerIsFounding(false);
        setLikedTrackIds([]);
        setPlaylists([]);
      }
    }

    void loadViewerState();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadViewerState();
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 1800);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (!playlistMenuOpen || !viewerUserId) return;
    const userId = viewerUserId;

    async function refreshPlaylists() {
      try {
        const nextPlaylists = await fetchUserPlaylists(userId);
        setPlaylists(nextPlaylists);
      } catch (error) {
        console.warn("player bar playlists refresh warning:", error);
      }
    }

    void refreshPlaylists();
  }, [playlistMenuOpen, viewerUserId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function handleTrackLikeChanged(event: Event) {
      const detail = (event as CustomEvent<{ trackId?: string; liked?: boolean }>).detail;
      const trackId = detail?.trackId;
      const liked = detail?.liked;

      if (!trackId || typeof liked !== "boolean") return;

      setLikedTrackIds((prev) =>
        liked
          ? (prev.includes(trackId) ? prev : [...prev, trackId])
          : prev.filter((id) => id !== trackId)
      );
    }

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setPlaylistMenuOpen(false);
      }
    }

    window.addEventListener("soundiox:track-like-changed", handleTrackLikeChanged);
    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("soundiox:track-like-changed", handleTrackLikeChanged);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  const onSeekBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    seek(ratio * duration);
  };

  async function handleToggleLike() {
    if (!currentTrackId || likeLoading) return;

    if (!viewerLoggedIn) {
      setFeedback("Log in to use likes");
      return;
    }

    if (!viewerCanLike) {
      setFeedback("Premium or Artist unlocks likes");
      return;
    }

    if (!viewerUserId) {
      setFeedback("Please log in first");
      return;
    }

    try {
      setLikeLoading(true);

      if (isLiked) {
        setLikedTrackIds((prev) => prev.filter((id) => id !== currentTrackId));
        broadcastTrackLikeChanged(currentTrackId, false);
        await unlikeTrack(viewerUserId, currentTrackId);
        return;
      }

      setLikedTrackIds((prev) =>
        prev.includes(currentTrackId) ? prev : [...prev, currentTrackId]
      );
      broadcastTrackLikeChanged(currentTrackId, true);
      await likeTrack(viewerUserId, currentTrackId);
    } catch (error: any) {
      setLikedTrackIds((prev) =>
        isLiked
          ? (prev.includes(currentTrackId) ? prev : [...prev, currentTrackId])
          : prev.filter((id) => id !== currentTrackId)
      );
      broadcastTrackLikeChanged(currentTrackId, isLiked);
      setFeedback(error?.message || "Like failed");
    } finally {
      setLikeLoading(false);
    }
  }

  async function handleAddToPlaylist(playlistId: string) {
    if (!currentTrackId || !viewerUserId) return;

    try {
      setAddingPlaylistId(playlistId);
      await addTrackToPlaylist(playlistId, currentTrackId);
      const playlistName =
        playlists.find((playlist) => playlist.id === playlistId)?.name ?? "playlist";
      setFeedback(`Added to ${playlistName} ✓`);
      setPlaylistMenuOpen(false);
    } catch {
      setFeedback("This track is already in that playlist");
    } finally {
      setAddingPlaylistId(null);
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[rgba(7,10,20,0.9)] shadow-[0_-8px_30px_rgba(0,0,0,0.6)] backdrop-blur-xl lg:bottom-[5mm]">
      <div
        className="mx-auto max-w-6xl px-4 py-2 lg:py-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.2rem)" }}
      >
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-4">
          <div className="min-w-0 lg:w-[220px]">
            <div className="truncate text-[11px] font-semibold leading-tight text-white lg:text-sm">
              {title}
            </div>
            <div className="truncate text-[9px] leading-tight text-white/70 lg:text-xs">
              {artist}
            </div>
            {feedback ? (
              <div className="mt-1 truncate text-[9px] text-cyan-200 lg:text-[11px]">
                {feedback}
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-1 sm:justify-start lg:gap-2">
            <button
              onClick={prev}
              disabled={transportDisabled}
              className="cursor-pointer rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50 lg:rounded-xl lg:px-3 lg:py-2 lg:text-sm"
              aria-label="Previous"
              type="button"
            >
              ◀
            </button>

            <button
              onClick={toggle}
              disabled={transportDisabled}
              className="cursor-pointer min-w-[50px] rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50 lg:min-w-[84px] lg:rounded-xl lg:px-4 lg:py-2 lg:text-sm"
              aria-label={isPlaying ? "Pause" : "Play"}
              type="button"
            >
              {isPlaying ? "Pause" : "Play"}
            </button>

            <button
              onClick={next}
              disabled={transportDisabled}
              className="cursor-pointer rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50 lg:rounded-xl lg:px-3 lg:py-2 lg:text-sm"
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

          <div className="flex items-center gap-3 lg:ml-auto" ref={menuRef}>
            <button
              type="button"
              onClick={() => void handleToggleLike()}
              disabled={!currentTrackId || likeLoading}
              className={`cursor-pointer rounded-xl px-3 py-1.5 text-[11px] font-semibold text-white ring-1 transition lg:px-4 lg:py-2 lg:text-sm ${
                isLiked
                  ? "bg-gradient-to-r from-rose-500 to-red-500 ring-rose-200/35 hover:opacity-95"
                  : "bg-gradient-to-r from-cyan-400 to-sky-400 ring-cyan-200/30 hover:opacity-95"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {likeLoading ? "..." : "Like"}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  if (!currentTrackId) return;
                  setPlaylistMenuOpen((prev) => !prev);
                }}
                disabled={!currentTrackId}
                className="cursor-pointer rounded-xl bg-gradient-to-r from-cyan-400 to-sky-400 px-3 py-1.5 text-[11px] font-semibold text-white ring-1 ring-cyan-200/30 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 lg:px-4 lg:py-2 lg:text-sm"
              >
                Add
              </button>

              {playlistMenuOpen ? (
                <div className="absolute bottom-11 right-0 z-50 w-64 rounded-2xl border border-white/10 bg-[rgba(7,10,20,0.96)] p-3 shadow-2xl backdrop-blur-xl lg:bottom-14">
                  {!viewerLoggedIn ? (
                    <div className="text-sm text-white/75">Log in to use playlists.</div>
                  ) : playlists.length === 0 ? (
                    <div className="text-sm text-white/75">
                      No playlists yet. Create one on Discover first.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                        Add To Playlist
                      </div>

                      {playlists.map((playlist) => (
                        <button
                          key={playlist.id}
                          type="button"
                          onClick={() => void handleAddToPlaylist(playlist.id)}
                          disabled={addingPlaylistId !== null}
                          className="flex w-full cursor-pointer items-center justify-between rounded-xl bg-white/8 px-3 py-2 text-left text-sm font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <span className="truncate">{playlist.name}</span>
                          {addingPlaylistId === playlist.id ? (
                            <span className="text-xs text-white/55">...</span>
                          ) : (
                            <span className="text-xs text-cyan-200">Add</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={shuffleQueue}
              disabled={!currentTrack}
              className={`px-3 py-1.5 text-[11px] font-semibold ring-1 transition lg:px-4 lg:py-2 lg:text-sm ${
                isShuffleEnabled
                  ? "cursor-pointer rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white ring-emerald-200/40 shadow-[0_0_18px_rgba(74,222,128,0.35)]"
                  : "cursor-pointer rounded-xl bg-white/10 text-white ring-white/10 hover:bg-white/15"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              Shuffle
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
