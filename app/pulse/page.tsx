"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { usePlayer } from "@/app/components/PlayerContext";
import CustomSelect from "@/app/components/CustomSelect";
import {
  createArtistIdentityMap,
  enrichTracksWithArtistIdentity,
  type ArtistIdentityProfile,
} from "@/lib/artistIdentity";

type SortKey = "plays_month" | "likes_month";
type CategoryKey = "global" | "new_rising" | "estonia";
type FollowRow = {
  follower_id: string;
  following_profile_id: string;
};
type PulseTrack = any & {
  artistDisplayName: string;
  artistSlug: string | null;
  user_id: string | null;
};

function monthStartISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function safeStr(v: any) {
  return (v ?? "").toString();
}

function isAbsoluteUrl(u: string) {
  return /^https?:\/\//i.test(u);
}

function getArtworkSrc(t: any) {
  const raw =
    t.artwork_url ||
    t.cover_url ||
    t.image_url ||
    t.artwork ||
    t.cover ||
    t.image ||
    "";

  if (!raw) return "/logo-new.png";

  const s = safeStr(raw).trim();
  if (!s) return "/logo-new.png";
  if (isAbsoluteUrl(s)) return s;
  if (s.startsWith("/")) return s;

  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${s}`;
}

export default function PulsePage() {
  console.log("NEW PULSE BUILD");

  const router = useRouter();
  const { playTrack, currentTrack, isPlaying, toggle } = usePlayer();

  const [tracks, setTracks] = useState<any[]>([]);
  const [likesMonth, setLikesMonth] = useState<Map<string, number>>(new Map());
  const [likedSet, setLikedSet] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [followerCounts, setFollowerCounts] = useState<Record<string, number>>({});
  const [followingArtistIds, setFollowingArtistIds] = useState<Set<string>>(new Set());
  const [followLoadingArtistId, setFollowLoadingArtistId] = useState<string | null>(null);

  const [sort, setSort] = useState<SortKey>("plays_month");
  const [category, setCategory] = useState<CategoryKey>("global");
  const [genre, setGenre] = useState<string>("All genres");
  const [q, setQ] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const month = useMemo(() => monthStartISO(), []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const { data: tRows, error: tErr } = await supabase
        .from("tracks")
        .select("*")
        .eq("is_published", true);

      if (tErr) console.error("Pulse tracks error:", tErr);

      const safe = (tRows ?? []) as PulseTrack[];
      const artistIds = Array.from(
        new Set(
          safe
            .map((track) => track.user_id)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
        )
      );

      if (artistIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, display_name, slug, avatar_url, is_founding, is_pro")
          .in("id", artistIds);

        if (profilesError) {
          console.warn("Pulse profiles error:", profilesError);
          setTracks(safe);
        } else {
          const profileMap = createArtistIdentityMap(
            (profiles ?? []) as ArtistIdentityProfile[]
          );
          setTracks(enrichTracksWithArtistIdentity(safe, profileMap));
        }
      } else {
        setTracks(safe);
      }

      const ids = safe.map((t: any) => t.id).filter(Boolean);

      if (ids.length > 0) {
        const { data: likeRows, error: likeErr } = await supabase
          .from("likes")
          .select("track_id")
          .eq("month", month)
          .in("track_id", ids);

        if (likeErr) console.warn("Pulse likes query error:", likeErr);

        const map = new Map<string, number>();
        (likeRows ?? []).forEach((row: any) => {
          const trackId = String(row.track_id);
          map.set(trackId, (map.get(trackId) ?? 0) + 1);
        });
        setLikesMonth(map);
      } else {
        setLikesMonth(new Map());
      }

      if (userId && ids.length > 0) {
        const { data: myLikes, error: myErr } = await supabase
          .from("likes")
          .select("track_id")
          .eq("user_id", userId)
          .eq("month", month)
          .in("track_id", ids);

        if (myErr) console.warn("Pulse my likes error:", myErr);

        const set = new Set<string>();
        (myLikes ?? []).forEach((r: any) => set.add(String(r.track_id)));
        setLikedSet(set);
      } else {
        setLikedSet(new Set());
      }

      if (artistIds.length > 0) {
        const { data: followerRows, error: followerError } = await supabase
          .from("follows")
          .select("following_profile_id")
          .in("following_profile_id", artistIds);

        if (followerError) {
          console.warn("Pulse follower counts error:", followerError);
        }

        const counts: Record<string, number> = {};
        (followerRows ?? []).forEach((row: any) => {
          const artistId = String(row.following_profile_id || "");
          if (!artistId) return;
          counts[artistId] = (counts[artistId] || 0) + 1;
        });
        setFollowerCounts(counts);

        if (userId) {
          const { data: myFollowRows, error: myFollowError } = await supabase
            .from("follows")
            .select("follower_id, following_profile_id")
            .eq("follower_id", userId)
            .in("following_profile_id", artistIds);

          if (myFollowError) {
            console.warn("Pulse follow state error:", myFollowError);
            setFollowingArtistIds(new Set());
          } else {
            const nextSet = new Set<string>();
            ((myFollowRows ?? []) as FollowRow[]).forEach((row) => {
              if (row.following_profile_id) {
                nextSet.add(row.following_profile_id);
              }
            });
            setFollowingArtistIds(nextSet);
          }
        } else {
          setFollowingArtistIds(new Set());
        }
      } else {
        setFollowerCounts({});
        setFollowingArtistIds(new Set());
      }

      setLoading(false);
    };

    void load();
  }, [userId, month]);

  const rewardPool = useMemo(() => {
    let sum = 0;
    likesMonth.forEach((v) => {
      sum += v;
    });
    return sum;
  }, [likesMonth]);

  const availableGenres = useMemo(() => {
    const set = new Set<string>();
    for (const t of tracks) {
      const g = safeStr(t.genre).trim();
      if (g) set.add(g);
    }
    return ["All genres", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [tracks]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();

    return tracks.filter((t: any) => {
      if (category === "new_rising") {
        const created = t.created_at ? new Date(t.created_at).getTime() : 0;
        const days30 = 30 * 24 * 60 * 60 * 1000;
        if (!created || Date.now() - created > days30) return false;
      }

      if (genre !== "All genres") {
        if (safeStr(t.genre) !== genre) return false;
      }

      if (!s) return true;

      const hay =
        `${safeStr(t.title)} ${safeStr(t.artist)} ${safeStr(t.genre)}`.toLowerCase();
      return hay.includes(s);
    });
  }, [tracks, q, genre, category]);

  const rows = useMemo(() => {
    const list = [...filtered];

    list.sort((a: any, b: any) => {
      const aLikes = likesMonth.get(String(a.id)) ?? 0;
      const bLikes = likesMonth.get(String(b.id)) ?? 0;

      if (sort === "likes_month") return bLikes - aLikes;

      return (
        (Number(b.plays_this_month ?? 0) || 0) -
        (Number(a.plays_this_month ?? 0) || 0)
      );
    });

    return list;
  }, [filtered, likesMonth, sort]);

  const toggleLike = async (trackId: string) => {
    if (!userId) {
      router.push("/login");
      return;
    }

    const liked = likedSet.has(trackId);

    if (liked) {
      const { error } = await supabase
        .from("likes")
        .delete()
        .eq("user_id", userId)
        .eq("track_id", trackId)
        .eq("month", month);

      if (error) console.error("Unlike error:", error);

      setLikedSet((prev) => {
        const s = new Set(prev);
        s.delete(trackId);
        return s;
      });

      setLikesMonth((prev) => {
        const m = new Map(prev);
        m.set(trackId, Math.max(0, (m.get(trackId) ?? 1) - 1));
        return m;
      });

      return;
    }

    const { error } = await supabase.from("likes").insert({
      user_id: userId,
      track_id: trackId,
      month,
    });

    if (error) {
      console.error("Like error:", error);
      return;
    }

    setLikedSet((prev) => new Set(prev).add(trackId));
    setLikesMonth((prev) => {
      const m = new Map(prev);
      m.set(trackId, (m.get(trackId) ?? 0) + 1);
      return m;
    });
  };

  const toggleArtistFollow = async (track: PulseTrack) => {
    const artistId = track.user_id;
    if (!artistId) return;

    if (!userId) {
      router.push("/login");
      return;
    }

    if (userId === artistId) {
      return;
    }

    setFollowLoadingArtistId(artistId);

    try {
      const isFollowing = followingArtistIds.has(artistId);

      if (isFollowing) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", userId)
          .eq("following_profile_id", artistId);

        if (error) throw error;

        setFollowingArtistIds((prev) => {
          const next = new Set(prev);
          next.delete(artistId);
          return next;
        });
        setFollowerCounts((prev) => ({
          ...prev,
          [artistId]: Math.max(0, (prev[artistId] || 0) - 1),
        }));
      } else {
        const { error } = await supabase.from("follows").insert({
          follower_id: userId,
          following_profile_id: artistId,
        });

        if (error) throw error;

        const { error: notificationError } = await supabase
          .from("notifications")
          .insert({
            user_id: artistId,
            type: "follow",
            actor_id: userId,
          });

        if (notificationError) {
          console.error("pulse follow notification insert error:", notificationError);
        }

        setFollowingArtistIds((prev) => new Set(prev).add(artistId));
        setFollowerCounts((prev) => ({
          ...prev,
          [artistId]: (prev[artistId] || 0) + 1,
        }));
      }
    } catch (error: any) {
      console.error("pulse artist follow error:", error);
      alert(error?.message || "Follow action failed");
    } finally {
      setFollowLoadingArtistId(null);
    }
  };

  const categoryOptions = [
    { value: "global", label: "Category: Global" },
    { value: "new_rising", label: "Category: New & Rising" },
    { value: "estonia", label: "Category: Estonia" },
  ];

  const genreOptions = availableGenres.map((g) => ({
    value: g,
    label: g === "All genres" ? "All genres" : g,
  }));

  const sortOptions = [
    { value: "plays_month", label: "Sort: Plays (month)" },
    { value: "likes_month", label: "Sort: Likes (month)" },
  ];

  return (
    <div className="mx-auto max-w-6xl p-6 pb-28 md:pb-32">
      <div className="mb-3">
        <div className="flex items-center gap-2 text-2xl font-semibold text-white">
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-300">
            <span className="absolute inset-0 animate-ping rounded-full bg-cyan-300/80" />
          </span>
          <span>Pulse</span>
        </div>
        <div className="text-sm text-white/60">Community signal + momentum.</div>
      </div>

      <div className="mb-4 flex w-full flex-wrap items-center gap-3 md:flex-nowrap md:justify-between">
        <div className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white ring-1 ring-white/10">
          THIS MONTH REWARD POOL: {rewardPool} likes
        </div>

        <div className="flex w-full flex-wrap gap-3 md:w-auto md:flex-nowrap md:justify-end">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search track / artist / genre"
            className="h-10 w-full rounded-xl bg-white/10 px-4 text-white placeholder:text-white/40 ring-1 ring-white/10 md:w-[320px]"
          />

          <CustomSelect
            value={category}
            onChange={(value) => setCategory(value as CategoryKey)}
            options={categoryOptions}
            className="min-w-[170px]"
          />

          <CustomSelect
            value={genre}
            onChange={setGenre}
            options={genreOptions}
            className="min-w-[160px]"
          />

          <CustomSelect
            value={sort}
            onChange={(value) => setSort(value as SortKey)}
            options={sortOptions}
            className="min-w-[180px]"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white/10 ring-1 ring-white/10">
        <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-semibold tracking-widest text-white/60">
          <div className="col-span-6">TRACK</div>
          <div className="col-span-2 text-right">PLAYS</div>
          <div className="col-span-2 text-right">LIKES</div>
          <div className="col-span-2 text-right">ACTION</div>
        </div>

        {loading ? (
          <div className="p-4 text-white/60">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-4 text-white/60">No tracks.</div>
        ) : (
          rows.map((t: any, idx: number) => {
            const id = String(t.id);
            const liked = likedSet.has(id);
            const likes = likesMonth.get(id) ?? 0;
            const plays = Number(t.plays_this_month ?? 0) || 0;
            const isCurrent = currentTrack?.id && String(currentTrack.id) === id;

            return (
              <div
                key={id}
                className={`relative border-t border-white/10 px-4 py-4 transition ${
                  isCurrent
                    ? "bg-gradient-to-r from-purple-500/10 via-fuchsia-500/10 to-cyan-500/10"
                    : ""
                }`}
              >
                {isCurrent ? (
                  <div className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-gradient-to-b from-cyan-300 via-violet-400 to-fuchsia-400">
                    <div className="absolute inset-0 animate-pulse rounded-r-full bg-white/20" />
                  </div>
                ) : null}

                <div className="grid grid-cols-12 items-center gap-2">
                  <div className="col-span-6 flex min-w-0 items-center gap-3">
                    <div className="w-6 text-white/40">{idx + 1}</div>

                    <img
                      src={getArtworkSrc(t)}
                      alt={safeStr(t.title) || "Cover"}
                      className="h-10 w-10 rounded-xl object-cover ring-1 ring-white/10"
                      loading="lazy"
                    />

                    <div className="min-w-0">
                      <div className="truncate font-semibold text-white">
                        {safeStr(t.title) || "Untitled"}
                      </div>
                      <div className="truncate text-sm text-white/60">
                        <Link
                          href={
                            t.artistSlug
                              ? `/artists/${encodeURIComponent(safeStr(t.artistSlug))}`
                              : "#"
                          }
                          className="hover:text-white"
                        >
                          {safeStr(t.artistDisplayName || t.artist || "AI Artist")}
                        </Link>
                        {" • "}
                        {t.user_id ? followerCounts[String(t.user_id)] || 0 : 0} followers
                        {" • "}
                        {safeStr(t.genre || "-")}
                      </div>
                    </div>
                  </div>

                  <div className="col-span-2 text-right tabular-nums text-white/80">
                    {plays}
                  </div>

                  <div className="col-span-2 flex items-center justify-end gap-3 text-right tabular-nums text-white/80">
                    <span>{likes}</span>
                    <button
                      onClick={() => toggleLike(id)}
                      className={`text-xl leading-none transition ${
                        liked ? "text-red-500" : "text-cyan-300 hover:text-cyan-200"
                      }`}
                      title={liked ? "Unlike" : "Like"}
                    >
                      ♥
                    </button>
                  </div>

                  <div className="col-span-2 flex justify-end gap-2">
                    {t.user_id && userId !== t.user_id ? (
                      <button
                        onClick={() => void toggleArtistFollow(t)}
                        disabled={followLoadingArtistId === t.user_id}
                        className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                          followingArtistIds.has(String(t.user_id))
                            ? "bg-white/10 text-white hover:bg-white/15"
                            : "bg-gradient-to-r from-cyan-400 to-fuchsia-500 text-black hover:opacity-95"
                        } disabled:opacity-60`}
                      >
                        {followLoadingArtistId === t.user_id
                          ? "Saving..."
                          : followingArtistIds.has(String(t.user_id))
                          ? "Following"
                          : "Follow"}
                      </button>
                    ) : null}

                    <button
                      onClick={() => {
                        if (isCurrent) {
                          toggle();
                        } else {
                          playTrack(t, rows);
                        }
                      }}
                      className="rounded-xl bg-gradient-to-r from-cyan-400 to-purple-500 px-4 py-2 text-white"
                    >
                      {isCurrent ? (isPlaying ? "Pause" : "Play") : "Play"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
