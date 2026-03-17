"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
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
  const router = useRouter();
  const { currentTrack, isPlaying, playTrack, toggle } = usePlayer();

  const t = track as any;
  const active = isSameTrack(currentTrack, track);
  const showPause = active && isPlaying;

  const artistSlug = useMemo(() => {
    const raw = t.artistSlug;
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
  }, [t.artistSlug]);

  const artistUserId = useMemo(() => {
    const raw = t.user_id;
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
  }, [t.user_id]);

  const initialFollowers = useMemo(() => {
    const raw = t.artistFollowerCount;
    return typeof raw === "number" ? raw : 0;
  }, [t.artistFollowerCount]);

  const [viewerId, setViewerId] = useState<string | null>(null);
  const [followLoading, setFollowLoading] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(initialFollowers);

  useEffect(() => {
    setFollowerCount(initialFollowers);
  }, [initialFollowers]);

  useEffect(() => {
    let alive = true;

    async function loadFollowState() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!alive) return;

      const nextViewerId = user?.id ?? null;
      setViewerId(nextViewerId);

      if (artistUserId) {
        const { count, error: countError } = await supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("following_profile_id", artistUserId);

        if (!alive) return;

        if (!countError) {
          setFollowerCount(count || 0);
        }
      }

      if (!nextViewerId || !artistUserId || nextViewerId === artistUserId) {
        setIsFollowing(false);
        return;
      }

      const { data, error } = await supabase
        .from("follows")
        .select("follower_id, following_profile_id")
        .eq("follower_id", nextViewerId)
        .eq("following_profile_id", artistUserId)
        .maybeSingle();

      if (!alive) return;

      if (error) {
        console.warn("TrackCard follow lookup warning:", error.message);
        setIsFollowing(false);
        return;
      }

      setIsFollowing(Boolean(data));
    }

    void loadFollowState();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadFollowState();
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [artistUserId]);

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

  async function handleFollowClick() {
    if (!artistUserId) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      router.push("/login");
      return;
    }

    if (user.id === artistUserId) return;

    try {
      setFollowLoading(true);

      if (isFollowing) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", user.id)
          .eq("following_profile_id", artistUserId);

        if (error) throw error;

        setIsFollowing(false);
        setFollowerCount((prev) => Math.max(0, prev - 1));
        return;
      }

      const { error } = await supabase.from("follows").insert({
        follower_id: user.id,
        following_profile_id: artistUserId,
      });

      if (error) throw error;

      const { error: notificationError } = await supabase
        .from("notifications")
        .insert({
          user_id: artistUserId,
          type: "follow",
          actor_id: user.id,
        });

      if (notificationError) {
        console.error("TrackCard follow notification warning:", notificationError);
      }

      setIsFollowing(true);
      setFollowerCount((prev) => prev + 1);
    } catch (error: any) {
      console.warn("TrackCard follow toggle warning:", error?.message || error);
    } finally {
      setFollowLoading(false);
    }
  }

  const showFollowControl =
    Boolean(artistUserId) && Boolean(viewerId) && viewerId !== artistUserId;

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
                className="transition hover:text-cyan-300"
              >
                {getArtist(track)}
              </Link>
            ) : (
              <span>{getArtist(track)}</span>
            )}

            {getGenre(track) ? ` • ${getGenre(track)}` : ""}

            {showFollowControl ? (
              <>
                {" • "}
                <button
                  type="button"
                  onClick={handleFollowClick}
                  disabled={followLoading}
                  className="text-sm font-medium text-white/80 transition hover:text-cyan-300 disabled:opacity-60"
                >
                  {followLoading ? "..." : isFollowing ? "Following" : "Follow"}
                </button>
                {" • "}
                <span className="text-white/60">
                  {followerCount} follower{followerCount === 1 ? "" : "s"}
                </span>
              </>
            ) : followerCount > 0 ? (
              <>
                {" • "}
                <span className="text-white/60">
                  {followerCount} follower{followerCount === 1 ? "" : "s"}
                </span>
              </>
            ) : null}
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