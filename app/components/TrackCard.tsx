"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { usePlayer } from "@/app/components/PlayerContext";
import type { Track } from "@/app/components/PlayerContext";

type Props = {
  track: Track;
  allTracks?: Track[];
  onPlay?: () => void;
  onAdd?: (track: Track) => void;
  onLike?: (track: Track) => void;
  onFollow?: (artistId: string) => void;
  likeCount?: number;
  isLiked?: boolean;
  likeLoading?: boolean;
  canLike?: boolean;
  artistId?: string | null;
  showFollowButton?: boolean;
  isFollowing?: boolean;
  followLoading?: boolean;
};

function getTitle(track: Track) {
  const t = track as any;
  return (t.title ?? t.name ?? "Untitled").toString();
}

function getArtist(track: Track) {
  const t = track as any;
  return (t.artistDisplayName ?? t.displayArtist ?? t.artist ?? "AI Artist").toString();
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
  onAdd,
  onLike,
  onFollow,
  likeCount = 0,
  isLiked = false,
  likeLoading = false,
  canLike = true,
  artistId = null,
  showFollowButton = false,
  isFollowing = false,
  followLoading = false,
}: Props) {
  const { currentTrack, isPlaying, playTrack, toggle } = usePlayer();
  const [shareCopied, setShareCopied] = useState(false);

  const t = track as any;
  const active = isSameTrack(currentTrack, track);
  const showPause = active && isPlaying;
  const artistSlug =
    typeof t.artistSlug === "string" && t.artistSlug.trim() ? t.artistSlug.trim() : null;

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

  function handleAddClick() {
    if (onAdd) {
      onAdd(track);
    }
  }

  function handleLikeClick() {
    if (!canLike || likeLoading) return;
    if (onLike) {
      onLike(track);
    }
  }

  function handleFollowClick() {
    if (!artistId || !onFollow || followLoading) return;
    onFollow(artistId);
  }

  async function handleShareClick() {
    const trackId = t?.id ? String(t.id) : "";

    if (!trackId) return;

    try {
      const origin =
        typeof window !== "undefined"
          ? window.location.origin
          : process.env.NEXT_PUBLIC_APP_URL || "https://soundiox.io";

      const shareUrl = `${origin}/track/${trackId}`;

      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1800);
    } catch (error) {
      console.warn("share copy failed:", error);
    }
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
          <div className="truncate text-lg font-bold text-white">{getTitle(track)}</div>

          <div className="truncate text-sm font-medium text-white/80">
            {artistSlug ? (
              <Link
                href={`/artists/${encodeURIComponent(artistSlug)}`}
                className="transition hover:text-cyan-300"
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
        {showFollowButton ? (
          <button
            type="button"
            onClick={handleFollowClick}
            disabled={followLoading}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
              isFollowing
                ? "bg-white/10 text-white ring-white/10 hover:bg-white/14"
                : "bg-cyan-400/10 text-cyan-100 ring-cyan-300/20 hover:bg-cyan-400/15"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {followLoading ? "..." : isFollowing ? "Following" : "Follow"}
          </button>
        ) : null}

        <button
          type="button"
          onClick={handleLikeClick}
          disabled={!canLike || likeLoading}
          title={canLike ? "Like track" : "Upgrade to like tracks"}
          className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-semibold transition ${
            canLike
              ? isLiked
                ? "text-pink-200 hover:bg-white/10"
                : "text-white/55 hover:bg-white/10 hover:text-white/80"
              : "cursor-not-allowed text-white/30"
          }`}
        >
          <span className="text-base leading-none">{isLiked ? "♥" : "♡"}</span>
          <span>{likeLoading ? "..." : likeCount}</span>
        </button>

        <button
          type="button"
          onClick={handleShareClick}
          className="rounded-xl bg-white/8 px-3 py-2 text-sm font-semibold text-white/75 ring-1 ring-white/10 transition hover:bg-white/12 hover:text-white"
        >
          {shareCopied ? "Copied" : "Share"}
        </button>

        <button
          type="button"
          onClick={handleAddClick}
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
