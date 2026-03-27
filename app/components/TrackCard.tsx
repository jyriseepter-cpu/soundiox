"use client";

import Image from "next/image";
import { useMemo } from "react";
import { usePlayer } from "@/app/components/PlayerContext";

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
};

type TrackCardProps = {
  track: Track;
  allTracks: Track[];

  onPlay?: () => void;
  onAdd?: () => void;
  onLike?: () => void;
  onFollow?: () => void;

  likeCount?: number;
  isLiked?: boolean;
  likeLoading?: boolean;
  canLike?: boolean;

  artistId?: string | null;
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
  isLiked = false,
  likeLoading = false,
  canLike = true,
  showFollowButton = false,
  isFollowing = false,
  followLoading = false,
}: TrackCardProps) {
  const { playTrack, currentTrack, isPlaying, toggle } = usePlayer();

  const isCurrentTrack = currentTrack?.id === track.id;

  const playsLabel = useMemo(
    () => getPlaysLabel(track.plays_all_time, track.created_at),
    [track.plays_all_time, track.created_at]
  );

  const badge = useMemo(() => getTrackBadge(track.created_at), [track.created_at]);

  const fullTitle = getTitle(track);
  const shortTitle = shortenTitle(fullTitle, 20);

  function handlePlay() {
    if (onPlay) {
      onPlay();
      return;
    }

    if (isCurrentTrack) {
      toggle();
      return;
    }

    playTrack(track as any, allTracks as any);
  }

  function handleShare() {
    if (typeof window === "undefined") return;

    const url = `${window.location.origin}/track/${track.id}`;

    if (navigator.share) {
      navigator
        .share({
          title: fullTitle,
          text: `${getArtistName(track)} on SoundioX`,
          url,
        })
        .catch(() => {});
      return;
    }

    navigator.clipboard.writeText(url).catch(() => {});
  }

  return (
    <div className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur-xl transition hover:border-cyan-400/30 hover:bg-white/10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.10),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(168,85,247,0.12),transparent_35%)] opacity-80" />

      <div className="relative flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          <Image
            src={getArtworkSrc(track)}
            alt={fullTitle}
            fill
            className="object-cover"
            sizes="64px"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3
              className="min-w-0 flex-1 truncate text-lg font-semibold text-white"
              title={fullTitle}
            >
              {shortTitle}
            </h3>

            {badge ? (
              <span className="inline-flex shrink-0 items-center rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-[11px] font-medium text-cyan-200">
                {badge}
              </span>
            ) : null}
          </div>

          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-sm text-white/75">
            <span
              className="truncate"
              title={`${getArtistName(track)} • ${getGenreName(track)}`}
            >
              {getArtistName(track)} • {getGenreName(track)}
            </span>

            {showFollowButton ? (
              <button
                type="button"
                onClick={onFollow}
                disabled={followLoading}
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
                  isFollowing
                    ? "bg-white/12 text-white/80 hover:bg-white/18"
                    : "bg-cyan-400/15 text-cyan-200 hover:bg-cyan-400/20"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {followLoading ? "..." : isFollowing ? "Following" : "Follow"}
              </button>
            ) : null}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/60">
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
              Plays: {playsLabel}
            </span>

            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
              Likes: {likeCount}
            </span>
          </div>
        </div>

        <div className="hidden shrink-0 items-center gap-2 md:flex">
          <button
            type="button"
            onClick={() => {
              if (canLike && onLike) void onLike();
            }}
            disabled={!canLike || likeLoading}
            className={`min-w-[52px] rounded-2xl px-3 py-2 text-sm font-semibold transition ${
              !canLike
                ? "cursor-not-allowed bg-white/5 text-white/35"
                : isLiked
                  ? "bg-white/10 text-cyan-200 hover:bg-white/15"
                  : "bg-white/10 text-white hover:bg-white/15"
            }`}
          >
            {likeLoading ? "..." : `♡ ${likeCount}`}
          </button>

          <button
            type="button"
            onClick={handleShare}
            className="min-w-[70px] rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
          >
            Share
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
        <button
          type="button"
          onClick={() => {
            if (canLike && onLike) void onLike();
          }}
          disabled={!canLike || likeLoading}
          className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
            !canLike
              ? "cursor-not-allowed bg-white/5 text-white/35"
              : isLiked
                ? "bg-white/10 text-cyan-200 hover:bg-white/15"
                : "bg-white/10 text-white hover:bg-white/15"
          }`}
        >
          {likeLoading ? "..." : `♡ ${likeCount}`}
        </button>

        <button
          type="button"
          onClick={handleShare}
          className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
        >
          Share
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