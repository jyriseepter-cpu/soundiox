"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import type { Track } from "@/app/components/PlayerContext";
import {
  normalizeArtistIdentity,
  type ArtistIdentityProfile,
} from "@/lib/artistIdentity";

type FeaturedArtist = ReturnType<typeof normalizeArtistIdentity>;

type Props = {
  artistName: string;
  genre: string;
  selectedTitle: string;
  artworkSrc: string;
  artistProfileId: string | null;
  artistSlug: string | null;
  followerCount: number;
  isFollowing: boolean;
  followLoading: boolean;
  showFollowButton: boolean;

  tracks: Track[];
  onSelectTrack: (t: Track) => void;
  onPlayClick: (t: Track) => void;
  onToggleFollow: (artistId: string) => void;

  isPlaying: boolean;
  currentTrackId: string | null;

  onUpgradePlan: (plan: "premium" | "artist") => Promise<void>;
  selectedTrack: Track | null;
  viewerHasPaidPlan: boolean;
};

const glassBox = "rounded-2xl bg-white/8 ring-1 ring-white/10 p-3";

const playBtnClass =
  "h-9 rounded-xl px-4 text-sm font-bold text-white ring-1 ring-white/15 " +
  "bg-gradient-to-r from-teal-500/70 to-fuchsia-500/70 hover:from-teal-500/85 hover:to-fuchsia-500/85";

export default function ArtistPanel(props: Props) {
  const {
    artistName,
    genre,
    artworkSrc,
    artistProfileId,
    artistSlug,
    followerCount,
    isFollowing,
    followLoading,
    showFollowButton,
    tracks,
    onPlayClick,
    onToggleFollow,
    isPlaying,
    currentTrackId,
    onUpgradePlan,
    viewerHasPaidPlan,
  } = props;

  const [user, setUser] = useState<any>(null);
  const [upgradeLoading, setUpgradeLoading] = useState<"premium" | "artist" | null>(null);

  const [featuredArtists, setFeaturedArtists] = useState<FeaturedArtist[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user ?? null);
    };

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    async function fetchFeaturedArtists() {
      try {
        setFeaturedLoading(true);

        const { data, error } = await supabase
          .from("profiles")
          .select(
            "id, display_name, bio, country, avatar_url, slug, role, is_founding, like_count_month, created_at"
          )
          .order("is_founding", { ascending: false })
          .order("like_count_month", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(12);

        if (error) {
          console.error("Featured artists load error:", error.message);
          if (!ignore) setFeaturedArtists([]);
          return;
        }

        if (!ignore) {
          const normalized = ((data ?? []) as ArtistIdentityProfile[])
            .map(normalizeArtistIdentity)
            .filter((artist) => (artist.role === "artist" || artist.isFounding) && artist.displayName)
            .slice(0, 4);

          setFeaturedArtists(normalized);
        }
      } catch (error) {
        console.error("Featured artists unexpected error:", error);
        if (!ignore) setFeaturedArtists([]);
      } finally {
        if (!ignore) setFeaturedLoading(false);
      }
    }

    void fetchFeaturedArtists();

    return () => {
      ignore = true;
    };
  }, []);

  const topTracks = useMemo(() => tracks.slice(0, 8), [tracks]);

  async function handleUpgrade(plan: "premium" | "artist") {
    try {
      setUpgradeLoading(plan);
      await onUpgradePlan(plan);
    } finally {
      setUpgradeLoading(null);
    }
  }

  function handleFollowClick() {
    if (!artistProfileId || followLoading) return;
    onToggleFollow(artistProfileId);
  }

  const showUpgradeActions = user ? !viewerHasPaidPlan : true;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <img
          src={artworkSrc || "/logo-new.png"}
          alt="art"
          className="h-12 w-12 rounded-xl object-cover ring-1 ring-white/10"
        />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {artistSlug ? (
              <Link
                href={`/artists/${encodeURIComponent(artistSlug)}`}
                className="text-base font-bold text-white transition hover:text-cyan-300"
              >
                {artistName}
              </Link>
            ) : (
              <div className="text-base font-bold text-white">{artistName}</div>
            )}

            <span className="text-xs font-semibold text-white/45">
              {followerCount} follower{followerCount === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-white/65">Genre: {genre}</div>

            {showFollowButton ? (
              <button
                type="button"
                onClick={handleFollowClick}
                disabled={followLoading}
                className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 transition ${
                  isFollowing
                    ? "bg-white/10 text-white ring-white/10 hover:bg-white/14"
                    : "bg-gradient-to-r from-cyan-400/20 to-fuchsia-500/20 text-cyan-100 ring-cyan-300/20 hover:from-cyan-400/25 hover:to-fuchsia-500/25"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {followLoading ? "..." : isFollowing ? "Following" : "Follow"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className={glassBox}>
        <div className="mb-2 text-xs font-bold tracking-widest text-white/60">
          TRACKS
        </div>

        <div className="space-y-2">
          {topTracks.map((t) => {
            const isCurrent =
              currentTrackId != null && String(currentTrackId) === String((t as any).id);

            return (
              <div
                key={String((t as any).id)}
                className="flex items-center justify-between rounded-xl bg-white/8 px-3 py-2"
              >
                <div className="truncate text-sm font-bold text-white/95">
                  {((t as any).title ?? (t as any).name ?? "Untitled").toString()}
                </div>

                <button onClick={() => onPlayClick(t)} className={playBtnClass}>
                  {isCurrent && isPlaying ? "Playing" : "Play"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {showUpgradeActions ? (
        <div className="space-y-3">
          {!user ? (
            <div className="rounded-2xl bg-white/8 px-4 py-3 text-center text-sm font-semibold text-white/70 ring-1 ring-white/10">
              Log in to create playlists, upgrade, and unlock more features.
            </div>
          ) : null}

          <button
            onClick={() => handleUpgrade("premium")}
            disabled={upgradeLoading !== null || !user}
            className="h-10 w-full rounded-xl bg-yellow-400 font-bold text-black hover:bg-yellow-300 disabled:opacity-60"
          >
            {upgradeLoading === "premium" ? "Opening..." : "Upgrade to Premium"}
          </button>

          <div className="text-center text-xs font-semibold text-white/55">
            Premium unlocks monthly likes. Playlists are available to every logged-in user.
          </div>

          <button
            onClick={() => handleUpgrade("artist")}
            disabled={upgradeLoading !== null || !user}
            className="h-10 w-full rounded-xl bg-gradient-to-r from-cyan-400 to-fuchsia-500 font-bold text-white hover:opacity-95 disabled:opacity-60"
          >
            {upgradeLoading === "artist" ? "Opening..." : "Become Artist"}
          </button>

          <div className="text-center text-xs font-semibold text-white/55">
            Artist unlocks uploads and artist access.
          </div>
        </div>
      ) : null}

      <div className={glassBox}>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-bold tracking-widest text-white/60">
            FEATURED ARTISTS
          </div>

          <Link
            href="/artists"
            className="cursor-pointer text-xs font-bold text-cyan-300 hover:text-cyan-200"
          >
            View all
          </Link>
        </div>

        {featuredLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl bg-white/8 px-3 py-2"
              >
                <div className="h-10 w-10 animate-pulse rounded-full bg-white/10" />
                <div className="min-w-0 flex-1">
                  <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
                  <div className="mt-2 h-3 w-32 animate-pulse rounded bg-white/5" />
                </div>
              </div>
            ))}
          </div>
        ) : featuredArtists.length === 0 ? (
          <div className="text-sm font-semibold text-white/60">
            No featured artists yet.
          </div>
        ) : (
          <div className="space-y-2">
            {featuredArtists.map((artist) => {
              const href = artist.slug ? `/artists/${artist.slug}` : `/artists/${artist.id}`;

              const initials =
                (artist.displayName || "AI")
                  .split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase() || "AI";

              const isArtistRole = artist.role === "artist";

              return (
                <Link
                  key={artist.id}
                  href={href}
                  className="block cursor-pointer rounded-xl bg-white/8 px-3 py-2 transition hover:bg-white/12"
                >
                  <div className="flex items-center gap-3">
                    {artist.avatarUrl ? (
                      <img
                        src={artist.avatarUrl}
                        alt={artist.displayName || "Artist"}
                        className={`h-10 w-10 rounded-full object-cover ${
                          artist.isFounding
                            ? "ring-2 ring-amber-400/80"
                            : "ring-1 ring-white/10"
                        }`}
                      />
                    ) : (
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white ${
                          artist.isFounding
                            ? "bg-gradient-to-br from-amber-400/35 to-orange-500/25 ring-2 ring-amber-400/80"
                            : "bg-gradient-to-br from-teal-500/25 to-fuchsia-500/25 ring-1 ring-white/10"
                        }`}
                      >
                        {initials}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-bold text-white">
                          {artist.displayName || "Unnamed artist"}
                        </div>

                        {artist.isFounding ? (
                          <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-200 ring-1 ring-amber-300/20">
                            Founding
                          </span>
                        ) : null}

                        {isArtistRole ? (
                          <span className="rounded-full bg-fuchsia-400/15 px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-200 ring-1 ring-fuchsia-300/20">
                            Artist
                          </span>
                        ) : null}
                      </div>

                      <div className="truncate text-xs font-semibold text-white/55">
                        {artist.bio
                          ? artist.bio
                          : artist.country
                          ? artist.country
                          : `Pulse likes: ${artist.likeCountMonth ?? 0}`}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
