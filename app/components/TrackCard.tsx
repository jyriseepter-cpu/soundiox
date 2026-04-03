"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/app/components/PlayerContext";
import LikeButton from "@/app/components/LikeButton";

type Track = {
  id: string;
  title?: string | null;
  artist?: string | null;
  artistDisplayName?: string | null;
  genre?: string | null;
  audio_url?: string | null;
  artwork_url?: string | null;
  created_at?: string | null;
  plays_all_time?: number | null;
  likes_this_month?: number | null;
  user_id?: string | null;
  artistSlug?: string | null;
  artistIsFounding?: boolean;
};

type TrackCardProps = {
  track: Track;
  allTracks: Track[];

  onPlay?: () => void;
  onAdd?: () => void;
  onLike?: () => void;
  onFollow?: () => void;

  likeCount?: number;
  allTimeLikeCount?: number;
  monthLikeCount?: number;
  isLiked?: boolean;
  likeLoading?: boolean;
  canLike?: boolean;
  artistIsFounding?: boolean;
  isCurrentMonthWinner?: boolean;
  isPreviousMonthWinner?: boolean;

  artistId?: string | null;
  trackHref?: string | null;
  artistHref?: string | null;
  showFollowButton?: boolean;
  isFollowing?: boolean;
  followLoading?: boolean;
};

function getHoursSince(dateString?: string | null) {
  if (!dateString) return Number.POSITIVE_INFINITY;

  const parsed = new Date(dateString).getTime();
  if (Number.isNaN(parsed)) return Number.POSITIVE_INFINITY;

  return (Date.now() - parsed) / 36e5;
}

function getTrackBadge(createdAt?: string | null) {
  const ageHours = getHoursSince(createdAt);

  if (ageHours < 6) return "Just dropped";
  if (ageHours < 24) return "New";

  return null;
}

function getPlaysLabel(plays?: number | null, createdAt?: string | null) {
  const ageHours = getHoursSince(createdAt);
  const safePlays = plays ?? 0;

  if (ageHours < 5) return "🔥";
  return String(safePlays);
}

function getArtworkSrc(track: Track) {
  return track.artwork_url || "/logo-new.png";
}

function getArtistName(track: Track) {
  return track.artistDisplayName || track.artist || "AI Artist";
}

function getGenreName(track: Track) {
  return track.genre || "-";
}

function getTitle(track: Track) {
  return track.title || "Untitled";
}

function shortenTitle(value: string, max = 20) {
  const clean = value.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}...`;
}

export default function TrackCard({
  track,
  allTracks,
  onPlay,
  onAdd,
  onLike,
  onFollow,
  likeCount = 0,
  allTimeLikeCount,
  monthLikeCount,
  isLiked = false,
  likeLoading = false,
  canLike = true,
  artistIsFounding = false,
  isCurrentMonthWinner = false,
  isPreviousMonthWinner = false,
  trackHref = null,
  artistHref = null,
  showFollowButton = false,
  isFollowing = false,
  followLoading = false,
}: TrackCardProps) {
  const router = useRouter();
  const { playTrack, currentTrack, isPlaying, toggle } = usePlayer();
  const [shareLabel, setShareLabel] = useState("Share");

  const isCurrentTrack = currentTrack?.id === track.id;

  const playsLabel = useMemo(
    () => getPlaysLabel(track.plays_all_time, track.created_at),
    [track.plays_all_time, track.created_at]
  );

  const badge = useMemo(() => getTrackBadge(track.created_at), [track.created_at]);

  const fullTitle = getTitle(track);
  const shortTitle = shortenTitle(fullTitle, 20);
  const resolvedAllTimeLikeCount = allTimeLikeCount ?? likeCount;
  const resolvedMonthLikeCount = monthLikeCount ?? likeCount;
  const artworkFrameClassName = artistIsFounding
    ? "relative shrink-0 rounded-[20px] bg-[linear-gradient(135deg,rgba(250,204,21,0.98),rgba(244,114,182,0.98),rgba(34,211,238,0.98))] p-[2px] shadow-[0_0_0_1px_rgba(250,204,21,0.55),0_0_32px_rgba(244,114,182,0.42)]"
    : "relative shrink-0";
  const artworkBorderClassName = isCurrentMonthWinner
    ? "border-amber-200/95 shadow-[0_0_0_2px_rgba(250,204,21,0.55),0_0_28px_rgba(250,204,21,0.45)]"
    : isPreviousMonthWinner
      ? "border-yellow-100/90 shadow-[0_0_0_2px_rgba(245,158,11,0.45),0_0_22px_rgba(245,158,11,0.38)]"
      : "border-white/10";

  useEffect(() => {
    if (shareLabel !== "Copied!") return;

    const timer = window.setTimeout(() => {
      setShareLabel("Share");
    }, 1400);

    return () => window.clearTimeout(timer);
  }, [shareLabel]);

  function handlePlay() {
    if (isCurrentTrack) {
      toggle();
      return;
    }

    if (onPlay) {
      onPlay();
      return;
    }

    playTrack(track as any, allTracks as any);
  }

  async function handleShare() {
    if (typeof window === "undefined") return;

    const url = `${window.location.origin}/track/${track.id}`;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      setShareLabel("Copied!");
    } catch {
      setShareLabel("Copy failed");
      window.setTimeout(() => setShareLabel("Share"), 1400);
    }
  }

  function handleTrackOpen() {
    if (!trackHref) return;
    router.push(trackHref);
  }

  function handleArtistOpen(e: MouseEvent) {
    e.stopPropagation();
    if (!artistHref) return;
    router.push(artistHref);
  }

  return (
    <div className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur-xl transition hover:border-cyan-400/30 hover:bg-white/10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.10),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(168,85,247,0.12),transparent_35%)] opacity-80" />

      <div className="relative flex items-center gap-4">
        <div className={artworkFrameClassName}>
          <button
            type="button"
            onClick={handleTrackOpen}
            className={`relative h-16 w-16 overflow-hidden rounded-2xl border bg-white/5 text-left ${artworkBorderClassName}`}
          >
            <Image
              src={getArtworkSrc(track)}
              alt={fullTitle}
              fill
              className="object-cover"
              sizes="64px"
            />
          </button>

          {artistIsFounding ? (
            <span className="pointer-events-none absolute -bottom-2 left-1/2 z-10 w-full max-w-[64px] -translate-x-1/2 overflow-hidden rounded-full border border-amber-200/70 bg-[linear-gradient(135deg,rgba(250,204,21,0.98),rgba(244,114,182,0.92))] px-1 py-0.5 text-center text-[7px] font-black uppercase tracking-[0.1em] text-slate-950 shadow-[0_0_16px_rgba(244,114,182,0.42)]">
              Founding
            </span>
          ) : null}

          {isCurrentMonthWinner ? (
            <span className="pointer-events-none absolute -top-2 left-1/2 z-10 w-full max-w-[58px] -translate-x-1/2 overflow-hidden rounded-full border border-yellow-100/80 bg-[linear-gradient(135deg,rgba(254,240,138,1),rgba(245,158,11,1))] px-1 py-0.5 text-center text-[7px] font-black uppercase tracking-[0.1em] text-slate-950 shadow-[0_0_24px_rgba(250,204,21,0.62)]">
              #1 Now
            </span>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={handleTrackOpen}
            className="block w-full text-left"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div
                className="min-w-0 truncate text-lg font-semibold text-white"
                title={fullTitle}
              >
                {shortTitle}
              </div>

              {isPreviousMonthWinner ? (
                <span className="inline-flex shrink-0 items-center rounded-full border border-amber-200/70 bg-[linear-gradient(135deg,rgba(254,240,138,0.24),rgba(245,158,11,0.28))] px-2 py-0.5 text-[10px] font-semibold text-amber-100 shadow-[0_0_16px_rgba(250,204,21,0.16)]">
                  🏆 Last month #1
                </span>
              ) : null}

              {badge ? (
                <span className="inline-flex shrink-0 items-center rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-[11px] font-medium text-cyan-200">
                  {badge}
                </span>
              ) : null}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/60">
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                Plays: {playsLabel}
              </span>

              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                All-time likes: {resolvedAllTimeLikeCount}
              </span>
            </div>
          </button>

          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-sm text-white/75">
            <button
              type="button"
              onClick={handleArtistOpen}
              className="truncate text-left transition hover:text-white"
              title={`${getArtistName(track)} • ${getGenreName(track)}`}
            >
              {getArtistName(track)} • {getGenreName(track)}
            </button>

            {showFollowButton ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFollow?.();
                }}
                disabled={followLoading}
                className={`shrink-0 bg-transparent p-0 text-sm font-medium transition ${
                  isFollowing
                    ? "text-white/75 hover:text-white"
                    : "text-cyan-200 hover:text-cyan-100"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {followLoading ? "..." : isFollowing ? "Following" : "Follow"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="hidden shrink-0 items-center gap-2 md:flex">
          <LikeButton
            trackId={String(track.id)}
            liked={isLiked}
            onToggle={() => {
              if (canLike && onLike) void onLike();
            }}
            likesCount={resolvedMonthLikeCount}
            disabled={!canLike}
            loading={likeLoading}
            showCount
          />

          <button
            type="button"
            onClick={handleShare}
            className="min-w-[88px] rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
          >
            {shareLabel}
          </button>

          <button
            type="button"
            onClick={onAdd}
            className="min-w-[64px] rounded-2xl bg-gradient-to-r from-cyan-400 to-sky-400 px-4 py-2 text-sm font-semibold text-white transition hover:scale-[1.02] active:scale-[0.98]"
          >
            Add
          </button>

          <button
            type="button"
            onClick={handlePlay}
            className="min-w-[72px] rounded-2xl bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-5 py-2 text-sm font-semibold text-white shadow-[0_0_30px_rgba(168,85,247,0.25)] transition hover:scale-[1.02] active:scale-[0.98]"
          >
            {isCurrentTrack && isPlaying ? "Pause" : "Play"}
          </button>
        </div>
      </div>

      <div className="relative mt-4 flex flex-wrap gap-2 md:hidden">
        <LikeButton
          trackId={String(track.id)}
          liked={isLiked}
          onToggle={() => {
            if (canLike && onLike) void onLike();
          }}
          likesCount={resolvedMonthLikeCount}
          disabled={!canLike}
          loading={likeLoading}
          showCount
        />

        <button
          type="button"
          onClick={handleShare}
          className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
        >
          {shareLabel}
        </button>

        <button
          type="button"
          onClick={onAdd}
          className="rounded-2xl bg-gradient-to-r from-cyan-400 to-sky-400 px-4 py-2 text-sm font-semibold text-white transition hover:scale-[1.02] active:scale-[0.98]"
        >
          Add
        </button>

        <button
          type="button"
          onClick={handlePlay}
          className="rounded-2xl bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-5 py-2 text-sm font-semibold text-white shadow-[0_0_30px_rgba(168,85,247,0.25)] transition hover:scale-[1.02] active:scale-[0.98]"
        >
          {isCurrentTrack && isPlaying ? "Pause" : "Play"}
        </button>
      </div>
    </div>
  );
}
