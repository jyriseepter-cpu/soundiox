"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { usePlayer } from "@/app/components/PlayerContext";
import CustomSelect from "@/app/components/CustomSelect";
import LikeButton from "@/app/components/LikeButton";
import { SOUNDIOX_GENRES, isSoundioXGenre } from "@/lib/genres";
import { normalizeAccessPlan } from "@/lib/lifetimeCampaign";
import { formatEuroPrice, SOUNDIOX_PRICING } from "@/lib/pricing";
import {
  broadcastTrackLikeChanged,
  fetchUserLikedTrackIds,
  likeTrack,
  unlikeTrack,
} from "@/lib/trackEngagement";

type SortKey = "plays_month" | "likes_month";
type CategoryKey = "global" | "new_rising" | "estonia";

type PulseTrack = {
  id: string;
  title: string | null;
  artist: string | null;
  genre: string | null;
  created_at: string | null;
  plays_this_month: number | null;
  audio_url?: string | null;
  artwork_url?: string | null;
  cover_url?: string | null;
  image_url?: string | null;
  artwork?: string | null;
  cover?: string | null;
  image?: string | null;
  user_id: string | null;
  is_published?: boolean | null;
  is_promo?: boolean | null;
  artistDisplayName: string;
  artistSlug: string | null;
  artistIsFounding?: boolean;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  slug: string | null;
  avatar_url: string | null;
  is_founding?: boolean | null;
  role?: string | null;
  plan?: string | null;
  country?: string | null;
};

type ViewerProfile = {
  role: string | null;
  plan: string | null;
  is_founding: boolean | null;
};

type TrackLikeMonthlyRow = {
  track_id: string | null;
  month: string | null;
  likes: number | null;
};

const MONTHLY_LIKE_LIMIT = 100;
const PAGE_SIZE = 50;

function monthStartISO() {
  const now = new Date();
  now.setDate(1);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function monthStartOffsetISO(offsetMonths: number) {
  const now = new Date();
  now.setDate(1);
  now.setMonth(now.getMonth() + offsetMonths);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function safeStr(v: unknown) {
  return (v ?? "").toString();
}

function isAbsoluteUrl(u: string) {
  return /^https?:\/\//i.test(u);
}

function getArtworkSrc(t: Partial<PulseTrack>) {
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

function getOfficialGenreLabel(value: string | null | undefined) {
  const raw = safeStr(value).trim();
  return isSoundioXGenre(raw) ? raw : "";
}

function normalizeRole(value: string | null | undefined) {
  if (value === "artist") return "artist";
  return "listener";
}

function logSupabaseError(label: string, error: unknown) {
  const err = error as
    | {
        message?: string | null;
        details?: string | null;
        hint?: string | null;
        code?: string | null;
      }
    | null
    | undefined;

  console.error(label, {
    message: err?.message ?? null,
    details: err?.details ?? null,
    hint: err?.hint ?? null,
    code: err?.code ?? null,
    raw: error,
  });
}

export default function PulsePage() {
  const router = useRouter();
  const { playTrack, currentTrack, isPlaying, toggle } = usePlayer();

  const [tracks, setTracks] = useState<PulseTrack[]>([]);
  const [likesMonth, setLikesMonth] = useState<Map<string, number>>(new Map());
  const [previousMonthWinnerTrackId, setPreviousMonthWinnerTrackId] = useState<string | null>(
    null
  );
  const [likedSet, setLikedSet] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [followLoadingId, setFollowLoadingId] = useState<string | null>(null);
  const [followerCounts, setFollowerCounts] = useState<Map<string, number>>(new Map());

  const [viewerRole, setViewerRole] = useState<"listener" | "artist">("listener");
  const [viewerPlan, setViewerPlan] = useState<"free" | "premium" | "artist" | "lifetime">(
    "free"
  );
  const [viewerIsFounding, setViewerIsFounding] = useState(false);
  const [viewerLikesUsed, setViewerLikesUsed] = useState(0);

  const [sort, setSort] = useState<SortKey>("likes_month");
  const [category, setCategory] = useState<CategoryKey>("global");
  const [genre, setGenre] = useState<string>("All genres");
  const [q, setQ] = useState<string>("");
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState("");
  const month = useMemo(() => monthStartISO(), []);
  const likedSetRef = useRef<Set<string>>(new Set());
  const trackIdsRef = useRef<Set<string>>(new Set());

  const viewerCanLike =
    viewerIsFounding ||
    viewerRole === "artist" ||
    viewerPlan === "premium" ||
    viewerPlan === "artist" ||
    viewerPlan === "lifetime";

  const likesRemaining = Math.max(0, MONTHLY_LIKE_LIMIT - viewerLikesUsed);

  useEffect(() => {
    likedSetRef.current = likedSet;
  }, [likedSet]);

  useEffect(() => {
    trackIdsRef.current = new Set(tracks.map((track) => String(track.id)));
  }, [tracks]);

  useEffect(() => {
    let alive = true;

    async function loadViewer() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.warn("Pulse auth user warning:", userError);
      }

      if (!alive) return;

      setUserId(user?.id ?? null);

      if (!user?.id) {
        setViewerRole("listener");
        setViewerPlan("free");
        setViewerIsFounding(false);
        setViewerLikesUsed(0);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, plan, is_founding")
        .eq("id", user.id)
        .maybeSingle<ViewerProfile>();

      if (profileError) {
        console.warn("Pulse viewer profile warning:", profileError);
        if (!alive) return;
        setViewerRole("listener");
        setViewerPlan("free");
        setViewerIsFounding(false);
      } else {
        if (!alive) return;
        setViewerRole(normalizeRole(profile?.role));
        setViewerPlan(normalizeAccessPlan(profile?.plan));
        setViewerIsFounding(Boolean(profile?.is_founding));
      }

      try {
        const likedTrackIds = await fetchUserLikedTrackIds(user.id);
        if (!alive) return;
        setViewerLikesUsed(likedTrackIds.length);
      } catch (error) {
        console.warn("Pulse monthly usage warning:", error);
        if (!alive) return;
        setViewerLikesUsed(0);
      }
    }

    void loadViewer();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadViewer();
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [month]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);

      const { data: tRows, error: tErr } = await supabase
        .from("tracks")
        .select(
          "id,title,artist,genre,created_at,plays_this_month,audio_url,artwork_url,user_id,is_published"
        )
        .eq("is_published", true);

      if (tErr) {
        logSupabaseError("Pulse tracks error", tErr);
      }

      const safeTracks: PulseTrack[] = ((tRows ?? []) as any[]).map((track) => ({
        ...track,
        artistDisplayName: safeStr(track.artist || "AI Artist"),
        artistSlug: null as string | null,
      }));

      const artistIds = Array.from(
        new Set(
          safeTracks
            .map((track) => track.user_id)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
        )
      );

      let enrichedTracks: PulseTrack[] = safeTracks;

      if (artistIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, display_name, slug, avatar_url, is_founding, role, plan, country")
          .in("id", artistIds);

        if (profilesError) {
          console.warn("Pulse profiles error:", profilesError);
        } else {
          const profileMap = new Map<string, ProfileRow>();
          ((profiles ?? []) as ProfileRow[]).forEach((profile) => {
            profileMap.set(profile.id, profile);
          });

          enrichedTracks = safeTracks.map((track) => {
            const profile = track.user_id ? profileMap.get(track.user_id) : undefined;

            return {
              ...track,
              artistDisplayName: safeStr(
                profile?.display_name || track.artist || "AI Artist"
              ),
              artistIsFounding: Boolean(profile?.is_founding),
              artistSlug:
                profile?.slug && safeStr(profile.slug).trim()
                  ? safeStr(profile.slug).trim()
                  : null,
            };
          });

          if (category === "estonia") {
            enrichedTracks = enrichedTracks.filter((track) => {
              const profile = track.user_id ? profileMap.get(track.user_id) : undefined;
              const country = safeStr(profile?.country).trim().toLowerCase();
              return country === "estonia" || country === "eesti";
            });
          }
        }

        const { data: followCountRows, error: followCountError } = await supabase
          .from("follows")
          .select("following_profile_id")
          .in("following_profile_id", artistIds);

        if (followCountError) {
          console.warn("Pulse follower counts error:", followCountError);
          setFollowerCounts(new Map());
        } else {
          const countMap = new Map<string, number>();
          (followCountRows ?? []).forEach((row: { following_profile_id: string }) => {
            const id = String(row.following_profile_id);
            countMap.set(id, (countMap.get(id) ?? 0) + 1);
          });
          setFollowerCounts(countMap);
        }
      } else {
        setFollowerCounts(new Map());
      }

      setTracks(enrichedTracks);

      const ids = enrichedTracks.map((t) => t.id).filter(Boolean);

      if (ids.length > 0) {
        try {
          const response = await fetch("/api/pulse-like-counts", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ trackIds: ids }),
          });

          const payload = await response.json().catch(() => null);

          if (!response.ok) {
            throw new Error(payload?.error || "Could not load Pulse like counts");
          }

          const map = new Map<string, number>();
          const counts = payload?.counts as Record<string, number> | undefined;

          Object.entries(counts ?? {}).forEach(([trackId, likes]) => {
            const safeTrackId = String(trackId || "").trim();
            if (!safeTrackId) return;
            map.set(safeTrackId, Number(likes ?? 0));
          });

          if (!alive) return;
          setLikesMonth(map);
        } catch (error) {
          console.warn("Pulse likes query error:", error);
          if (!alive) return;
          setLikesMonth(new Map());
        }

        const { data: previousWinnerRows, error: previousWinnerError } = await supabase
          .from("track_likes_monthly")
          .select("track_id,month,likes")
          .eq("month", monthStartOffsetISO(-1))
          .in("track_id", ids)
          .order("likes", { ascending: false })
          .limit(1);

        if (previousWinnerError) {
          console.warn("Pulse previous winner query error:", previousWinnerError);
          setPreviousMonthWinnerTrackId(null);
        } else {
          const winnerTrackId = previousWinnerRows?.[0]?.track_id;
          setPreviousMonthWinnerTrackId(
            typeof winnerTrackId === "string" && winnerTrackId.length > 0
              ? winnerTrackId
              : null
          );
        }
      } else {
        setLikesMonth(new Map());
        setPreviousMonthWinnerTrackId(null);
      }

      if (userId && ids.length > 0) {
        try {
          const likedTrackIds = await fetchUserLikedTrackIds(userId);
          const visibleTrackIds = new Set(ids.map((id) => String(id)));
          setLikedSet(
            new Set(likedTrackIds.filter((trackId) => visibleTrackIds.has(String(trackId))))
          );
        } catch (error) {
          console.warn("Pulse my likes error:", error);
          setLikedSet(new Set());
        }
      } else {
        setLikedSet(new Set());
      }

      if (userId && artistIds.length > 0) {
        const { data: followRows, error: followErr } = await supabase
          .from("follows")
          .select("following_profile_id")
          .eq("follower_id", userId)
          .in("following_profile_id", artistIds);

        if (followErr) {
          console.warn("Pulse follows query error:", followErr);
          setFollowingSet(new Set());
        } else {
          const set = new Set<string>();
          (followRows ?? []).forEach((row: { following_profile_id: string }) => {
            if (row?.following_profile_id) {
              set.add(String(row.following_profile_id));
            }
          });
          setFollowingSet(set);
        }
      } else {
        setFollowingSet(new Set());
      }

      setLoading(false);
    };

    void load();

    return () => {
      alive = false;
    };
  }, [userId, month, category]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function handleTrackLikeChanged(event: Event) {
      const detail = (event as CustomEvent<{ trackId?: string; liked?: boolean }>).detail;
      const trackId = String(detail?.trackId || "");
      const liked = detail?.liked;

      if (!trackId || typeof liked !== "boolean") return;

      const wasLiked = likedSetRef.current.has(trackId);
      if (wasLiked === liked) return;

      setLikedSet((prev) => {
        const next = new Set(prev);
        if (liked) {
          next.add(trackId);
        } else {
          next.delete(trackId);
        }
        return next;
      });

      setViewerLikesUsed((prev) => Math.max(0, prev + (liked ? 1 : -1)));

      if (!trackIdsRef.current.has(trackId)) return;

      setLikesMonth((prev) => {
        const next = new Map(prev);
        next.set(trackId, Math.max(0, (next.get(trackId) ?? 0) + (liked ? 1 : -1)));
        return next;
      });
    }

    window.addEventListener("soundiox:track-like-changed", handleTrackLikeChanged);

    return () => {
      window.removeEventListener("soundiox:track-like-changed", handleTrackLikeChanged);
    };
  }, []);

  const rewardPool = useMemo(() => {
    let sum = 0;
    likesMonth.forEach((v) => {
      sum += v;
    });
    return sum;
  }, [likesMonth]);

  const availableGenres = useMemo(() => ["All genres", ...SOUNDIOX_GENRES], []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();

    return tracks.filter((t) => {
      if (category === "new_rising") {
        const created = t.created_at ? new Date(t.created_at).getTime() : 0;
        const days30 = 30 * 24 * 60 * 60 * 1000;
        if (!created || Date.now() - created > days30) {
          return false;
        }
      }

      if (genre !== "All genres" && getOfficialGenreLabel(t.genre) !== genre) {
        return false;
      }

      if (!s) {
        return true;
      }

      const hay = `${safeStr(t.title)} ${safeStr(t.artistDisplayName)} ${safeStr(
        t.artist
      )} ${getOfficialGenreLabel(t.genre)}`.toLowerCase();

      return hay.includes(s);
    });
  }, [tracks, q, genre, category]);

  const rows = useMemo(() => {
    const list = [...filtered];

    list.sort((a, b) => {
      const aLikes = likesMonth.get(String(a.id)) ?? 0;
      const bLikes = likesMonth.get(String(b.id)) ?? 0;

      if (sort === "likes_month") {
        return bLikes - aLikes;
      }

      return (
        (Number(b.plays_this_month ?? 0) || 0) -
        (Number(a.plays_this_month ?? 0) || 0)
      );
    });

    return list;
  }, [filtered, likesMonth, sort]);
  const currentMonthWinnerTrackId = useMemo(() => {
    let topTrackId: string | null = null;
    let topLikes = 0;

    tracks.forEach((track) => {
      const trackId = String(track.id);
      const likes = likesMonth.get(trackId) ?? 0;

      if (likes > topLikes) {
        topTrackId = trackId;
        topLikes = likes;
      }
    });

    return topLikes > 0 ? topTrackId : null;
  }, [tracks, likesMonth]);

  useEffect(() => {
    setPage(1);
  }, [q, genre, sort, category]);

  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, totalRows);
  const visibleRows = rows.slice(startIndex, endIndex);

  async function shareTrack(trackId: string) {
    if (typeof window === "undefined") return;

    const url = `${window.location.origin}/track/${trackId}`;

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

      setActionMessage("Track link copied.");
      window.setTimeout(() => setActionMessage(""), 1600);
    } catch {
      setActionMessage("Could not copy track link.");
      window.setTimeout(() => setActionMessage(""), 1600);
    }
  }

  async function toggleLike(trackId: string) {
    setActionMessage("");

    if (!userId) {
      router.push("/login");
      return;
    }

    const track = tracks.find((item) => String(item.id) === String(trackId));
    const liked = likedSet.has(trackId);

    if (liked) {
      try {
        await unlikeTrack(userId, trackId);
      } catch (error) {
        console.error("Unlike error:", error);
        setActionMessage("Could not remove like right now.");
        return;
      }

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

      setViewerLikesUsed((prev) => Math.max(0, prev - 1));
      broadcastTrackLikeChanged(trackId, false);
      return;
    }

    if (!viewerCanLike) {
      setActionMessage("Upgrade required to like tracks.");
      return;
    }

    if (!track) {
      setActionMessage("Track not found.");
      return;
    }

    if (track.user_id && userId === track.user_id) {
      setActionMessage("You can’t like your own track.");
      return;
    }

    if (viewerLikesUsed >= MONTHLY_LIKE_LIMIT) {
      setActionMessage("You've used all monthly likes.");
      return;
    }

    try {
      await likeTrack(userId, trackId);
    } catch (error: any) {
      console.error("Like error:", error);

      if (
        typeof error.message === "string" &&
        (error.message.toLowerCase().includes("duplicate") ||
          error.message.toLowerCase().includes("unique"))
      ) {
        setActionMessage("You already liked this track this month.");
      } else {
        setActionMessage("Could not like this track right now.");
      }
      return;
    }

    setLikedSet((prev) => new Set(prev).add(trackId));
    setLikesMonth((prev) => {
      const m = new Map(prev);
      m.set(trackId, (m.get(trackId) ?? 0) + 1);
      return m;
    });
    setViewerLikesUsed((prev) => prev + 1);
    broadcastTrackLikeChanged(trackId, true);
  }

  async function toggleFollow(artistId: string | null) {
    if (!artistId) return;

    if (!userId) {
      router.push("/login");
      return;
    }

    if (userId === artistId) return;

    const isFollowing = followingSet.has(artistId);
    setFollowLoadingId(artistId);

    try {
      if (isFollowing) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", userId)
          .eq("following_profile_id", artistId);

        if (error) throw error;

        setFollowingSet((prev) => {
          const set = new Set(prev);
          set.delete(artistId);
          return set;
        });

        setFollowerCounts((prev) => {
          const map = new Map(prev);
          map.set(artistId, Math.max(0, (map.get(artistId) ?? 1) - 1));
          return map;
        });

        return;
      }

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
        console.error("Pulse follow notification warning:", notificationError);
      }

      setFollowingSet((prev) => new Set(prev).add(artistId));
      setFollowerCounts((prev) => {
        const map = new Map(prev);
        map.set(artistId, (map.get(artistId) ?? 0) + 1);
        return map;
      });
    } catch (error: any) {
      console.warn("Pulse follow toggle warning:", error?.message || error);
    } finally {
      setFollowLoadingId(null);
    }
  }

  const categoryOptions = [
    { value: "global", label: "Category: Global" },
    { value: "new_rising", label: "Category: New & Rising" },
    { value: "estonia", label: "Category: Estonia" },
  ];

  const genreOptions = availableGenres.map((g) => ({
    value: g,
    label: g,
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

      {!userId ? (
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75">
          You can listen without logging in. Log in to create playlists, follow artists, and unlock account features.
        </div>
      ) : !viewerCanLike ? (
        <div className="mb-4 rounded-2xl border border-fuchsia-300/20 bg-fuchsia-400/10 px-4 py-3 text-sm text-fuchsia-100">
          Free account active. You can listen and create playlists. Upgrade to Premium for likes at {formatEuroPrice(
            SOUNDIOX_PRICING.premium
          )} or become an Artist at {formatEuroPrice(
            SOUNDIOX_PRICING.artist
          )} to upload and like tracks.
        </div>
      ) : (
        <div className="mb-4 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
          Likes used this month: {viewerLikesUsed}/{MONTHLY_LIKE_LIMIT}
          {" · "}
          Remaining: {likesRemaining}
        </div>
      )}

      {actionMessage ? (
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
          {actionMessage}
        </div>
      ) : null}

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

      <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-white/8 px-4 py-3 ring-1 ring-white/10 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-white/75">
          {totalRows === 0
            ? "Showing 0 tracks"
            : `Showing ${startIndex + 1}-${endIndex} of ${totalRows} tracks`}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="cursor-pointer rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>

          <div className="min-w-[88px] text-center text-sm text-white/70">
            {currentPage} / {totalPages}
          </div>

          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={currentPage >= totalPages}
            className="cursor-pointer rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-2xl bg-white/10 ring-1 ring-white/10 md:block">
        <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-semibold tracking-widest text-white/60">
          <div className="col-span-5">TRACK</div>
          <div className="col-span-2 text-right">PLAYS</div>
          <div className="col-span-2 text-right">LIKES</div>
          <div className="col-span-3 text-right">ACTION</div>
        </div>

        {loading ? (
          <div className="p-4 text-white/60">Loading…</div>
        ) : visibleRows.length === 0 ? (
          <div className="p-4 text-white/60">No tracks.</div>
        ) : (
          visibleRows.map((t, idx) => {
            const id = String(t.id);
            const liked = likedSet.has(id);
            const likes = likesMonth.get(id) ?? 0;
            const plays = Number(t.plays_this_month ?? 0) || 0;
            const isCurrent = currentTrack?.id && String((currentTrack as any).id) === id;
            const artistId = t.user_id;
            const showFollowButton =
              Boolean(userId) && Boolean(artistId) && userId !== artistId;
            const isFollowing = artistId ? followingSet.has(artistId) : false;
            const followLoading = followLoadingId === artistId;
            const followerCount = artistId ? followerCounts.get(artistId) ?? 0 : 0;
            const isOwnTrack = Boolean(userId && artistId && userId === artistId);
            const isFoundingArtist = Boolean(t.artistIsFounding);
            const isCurrentMonthWinner = currentMonthWinnerTrackId === id;
            const isPreviousMonthWinner = previousMonthWinnerTrackId === id;
            const likeDisabled =
              !userId ||
              isOwnTrack ||
              (!liked && (!viewerCanLike || likesRemaining <= 0));
            const likeDisabledReason = !userId
              ? "Log in to like"
              : liked
              ? "Unlike"
              : isOwnTrack
              ? "You can’t like your own track"
              : !viewerCanLike
              ? "Upgrade required to like"
              : likesRemaining <= 0
              ? "Monthly like limit reached"
              : "Like";

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

                <div className="grid grid-cols-12 items-center gap-3">
                  <div className="col-span-5 flex min-w-0 items-center gap-4">
                    <div className="flex w-12 shrink-0 flex-col items-center gap-1">
                      <div className="text-white/40">{startIndex + idx + 1}</div>
                    </div>

                    <div
                      className={`relative shrink-0 ${
                        isFoundingArtist
                          ? "rounded-[14px] bg-[linear-gradient(135deg,rgba(250,204,21,0.98),rgba(244,114,182,0.98),rgba(34,211,238,0.98))] p-[2px] shadow-[0_0_0_1px_rgba(250,204,21,0.5),0_0_24px_rgba(244,114,182,0.36)]"
                          : ""
                      }`}
                    >
                      <img
                        src={getArtworkSrc(t)}
                        alt={safeStr(t.title) || "Cover"}
                        className={`h-14 w-14 rounded-2xl object-cover ring-1 ${
                          isCurrentMonthWinner
                            ? "ring-amber-200 shadow-[0_0_16px_rgba(250,204,21,0.36)]"
                            : isPreviousMonthWinner
                              ? "ring-orange-200 shadow-[0_0_12px_rgba(249,115,22,0.28)]"
                              : "ring-white/10"
                        }`}
                        loading="lazy"
                      />

                      {isCurrentMonthWinner ? (
                        <span className="pointer-events-none absolute -top-2 left-1/2 w-full max-w-[54px] -translate-x-1/2 overflow-hidden rounded-full border border-yellow-100/80 bg-[linear-gradient(135deg,rgba(254,240,138,1),rgba(245,158,11,1))] px-1 py-0.5 text-center text-[7px] font-black uppercase tracking-[0.08em] text-slate-950 shadow-[0_0_18px_rgba(250,204,21,0.52)]">
                          #1 Now
                        </span>
                      ) : null}

                      {isFoundingArtist ? (
                        <span className="pointer-events-none absolute -bottom-2 left-1/2 w-full max-w-[54px] -translate-x-1/2 overflow-hidden rounded-full border border-amber-200/70 bg-[linear-gradient(135deg,rgba(250,204,21,0.98),rgba(244,114,182,0.92))] px-1 py-0.5 text-center text-[7px] font-black uppercase tracking-[0.08em] text-slate-950 shadow-[0_0_14px_rgba(244,114,182,0.34)]">
                          Founding
                        </span>
                      ) : null}
                    </div>

                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="min-w-0 truncate font-semibold text-white">
                          {safeStr(t.title) || "Untitled"}
                        </div>

                        {isPreviousMonthWinner ? (
                          <span className="inline-flex shrink-0 items-center rounded-full border border-amber-200/70 bg-[linear-gradient(135deg,rgba(254,240,138,0.24),rgba(245,158,11,0.28))] px-2 py-0.5 text-[10px] font-semibold text-amber-100 shadow-[0_0_16px_rgba(250,204,21,0.16)]">
                            🏆 Last month #1
                          </span>
                        ) : null}
                      </div>

                      <div className="truncate text-sm text-white/60">
                        {t.artistSlug ? (
                          <Link
                            href={`/artists/${encodeURIComponent(t.artistSlug)}`}
                            className="cursor-pointer hover:text-white"
                          >
                            {safeStr(t.artistDisplayName || t.artist || "AI Artist")}
                          </Link>
                        ) : (
                          <span>{safeStr(t.artistDisplayName || t.artist || "AI Artist")}</span>
                        )}

                        {showFollowButton ? (
                          <>
                            {" · "}
                            <button
                              onClick={() => toggleFollow(artistId)}
                              disabled={followLoading}
                              className="cursor-pointer text-sm text-white/60 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {followLoading ? "..." : isFollowing ? "Following" : "Follow"}
                            </button>
                            {" · "}
                            <span>{followerCount} follower{followerCount === 1 ? "" : "s"}</span>
                          </>
                        ) : followerCount > 0 ? (
                          <>
                            {" · "}
                            <span>{followerCount} follower{followerCount === 1 ? "" : "s"}</span>
                          </>
                        ) : null}

                        {" · "}
                        {getOfficialGenreLabel(t.genre) || "-"}
                      </div>
                    </div>
                  </div>

                  <div className="col-span-2 text-right tabular-nums text-white/80">
                    {plays}
                  </div>

                  <div className="col-span-2 flex items-center justify-end gap-3 text-right tabular-nums text-white/80">
                    <LikeButton
                      trackId={id}
                      liked={liked}
                      likesCount={likes}
                      onToggle={toggleLike}
                      title={likeDisabledReason}
                      disabled={likeDisabled}
                      showCount
                    />
                  </div>

                  <div className="col-span-3 flex justify-end gap-2">
                    <button
                      onClick={() => {
                        if (isCurrent) {
                          toggle();
                        } else {
                          playTrack(t as any, rows as any);
                        }
                      }}
                      className="cursor-pointer rounded-xl bg-gradient-to-r from-cyan-400 to-purple-500 px-4 py-2 text-white"
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

      <div className="space-y-2.5 md:hidden">
        {loading ? (
          <div className="rounded-2xl bg-white/10 p-4 text-white/60 ring-1 ring-white/10">
            Loading…
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="rounded-2xl bg-white/10 p-4 text-white/60 ring-1 ring-white/10">
            No tracks.
          </div>
        ) : (
          visibleRows.map((t, idx) => {
            const id = String(t.id);
            const liked = likedSet.has(id);
            const likes = likesMonth.get(id) ?? 0;
            const plays = Number(t.plays_this_month ?? 0) || 0;
            const isCurrent = currentTrack?.id && String((currentTrack as any).id) === id;
            const artistId = t.user_id;
            const showFollowButton =
              Boolean(userId) && Boolean(artistId) && userId !== artistId;
            const isFollowing = artistId ? followingSet.has(artistId) : false;
            const followLoading = followLoadingId === artistId;
            const followerCount = artistId ? followerCounts.get(artistId) ?? 0 : 0;
            const isOwnTrack = Boolean(userId && artistId && userId === artistId);
            const isFoundingArtist = Boolean(t.artistIsFounding);
            const isCurrentMonthWinner = currentMonthWinnerTrackId === id;
            const isPreviousMonthWinner = previousMonthWinnerTrackId === id;
            const likeDisabled =
              !userId ||
              isOwnTrack ||
              (!liked && (!viewerCanLike || likesRemaining <= 0));
            const likeDisabledReason = !userId
              ? "Log in to like"
              : liked
                ? "Unlike"
                : isOwnTrack
                  ? "You can’t like your own track"
                  : !viewerCanLike
                    ? "Upgrade required to like"
                    : likesRemaining <= 0
                      ? "Monthly like limit reached"
                      : "Like";

            return (
              <div
                key={id}
                className={`relative overflow-hidden rounded-[26px] border border-white/10 bg-white/5 p-3.5 shadow-[0_10px_24px_rgba(0,0,0,0.22)] backdrop-blur-xl ${
                  isCurrent
                    ? "ring-1 ring-cyan-300/30 bg-[linear-gradient(135deg,rgba(34,211,238,0.08),rgba(217,70,239,0.08))]"
                    : ""
                }`}
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.10),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(168,85,247,0.12),transparent_35%)] opacity-80" />

                <div className="relative flex items-start gap-3">
                  <div className="flex w-7 shrink-0 flex-col items-center pt-0.5 text-xs font-semibold text-white/45">
                    {startIndex + idx + 1}
                  </div>

                  <div
                    className={`relative shrink-0 ${
                      isFoundingArtist
                        ? "rounded-[18px] bg-[linear-gradient(135deg,rgba(250,204,21,0.98),rgba(244,114,182,0.98),rgba(34,211,238,0.98))] p-[2px] shadow-[0_0_0_1px_rgba(250,204,21,0.5),0_0_18px_rgba(244,114,182,0.3)]"
                        : ""
                    }`}
                  >
                    <img
                      src={getArtworkSrc(t)}
                      alt={safeStr(t.title) || "Cover"}
                      className={`h-14 w-14 rounded-2xl object-cover ring-1 ${
                        isCurrentMonthWinner
                          ? "ring-amber-200 shadow-[0_0_12px_rgba(250,204,21,0.3)]"
                          : isPreviousMonthWinner
                            ? "ring-orange-200 shadow-[0_0_10px_rgba(249,115,22,0.24)]"
                            : "ring-white/10"
                      }`}
                      loading="lazy"
                    />

                    {isCurrentMonthWinner ? (
                      <span className="pointer-events-none absolute -top-2 left-1/2 w-full max-w-[54px] -translate-x-1/2 overflow-hidden rounded-full border border-yellow-100/80 bg-[linear-gradient(135deg,rgba(254,240,138,1),rgba(245,158,11,1))] px-1 py-0.5 text-center text-[7px] font-black uppercase tracking-[0.06em] text-slate-950 shadow-[0_0_14px_rgba(250,204,21,0.44)]">
                        #1 Now
                      </span>
                    ) : null}

                    {isFoundingArtist ? (
                      <span className="pointer-events-none absolute -bottom-2 left-1/2 w-full max-w-[54px] -translate-x-1/2 overflow-hidden rounded-full border border-amber-200/70 bg-[linear-gradient(135deg,rgba(250,204,21,0.98),rgba(244,114,182,0.92))] px-1 py-0.5 text-center text-[7px] font-black uppercase tracking-[0.06em] text-slate-950 shadow-[0_0_12px_rgba(244,114,182,0.28)]">
                        Founding
                      </span>
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <div className="min-w-0 truncate text-sm font-semibold text-white">
                        {safeStr(t.title) || "Untitled"}
                      </div>

                      {isPreviousMonthWinner ? (
                        <span className="inline-flex items-center rounded-full border border-amber-200/70 bg-[linear-gradient(135deg,rgba(254,240,138,0.24),rgba(245,158,11,0.28))] px-1.5 py-0.5 text-[9px] font-semibold text-amber-100 shadow-[0_0_12px_rgba(250,204,21,0.14)]">
                          🏆 Last month #1
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-white/60">
                      {t.artistSlug ? (
                        <Link
                          href={`/artists/${encodeURIComponent(t.artistSlug)}`}
                          className="cursor-pointer hover:text-white"
                        >
                          {safeStr(t.artistDisplayName || t.artist || "AI Artist")}
                        </Link>
                      ) : (
                        <span>{safeStr(t.artistDisplayName || t.artist || "AI Artist")}</span>
                      )}

                      <span>•</span>
                      <span>{getOfficialGenreLabel(t.genre) || "-"}</span>

                      {followerCount > 0 ? (
                        <>
                          <span>•</span>
                          <span>
                            {followerCount} follower{followerCount === 1 ? "" : "s"}
                          </span>
                        </>
                      ) : null}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-white/65">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
                        Plays this month: {plays}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
                        Likes this month: {likes}
                      </span>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <LikeButton
                        trackId={id}
                        liked={liked}
                        likesCount={likes}
                        onToggle={toggleLike}
                        title={likeDisabledReason}
                        disabled={likeDisabled}
                        wrapperClassName="min-w-[56px] items-center justify-start gap-2 rounded-2xl bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80"
                        buttonClassName="text-base"
                        showCount
                      />

                      {showFollowButton ? (
                        <button
                          type="button"
                          onClick={() => toggleFollow(artistId)}
                          disabled={followLoading}
                          className="min-w-[88px] cursor-pointer rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {followLoading ? "..." : isFollowing ? "Following" : "Follow"}
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => void shareTrack(id)}
                        className="min-w-[88px] cursor-pointer rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
                      >
                        Share
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (isCurrent) {
                            toggle();
                          } else {
                            playTrack(t as any, rows as any);
                          }
                        }}
                        className="min-w-[72px] cursor-pointer rounded-2xl bg-gradient-to-r from-cyan-400 to-purple-500 px-5 py-2 text-sm font-semibold text-white"
                      >
                        {isCurrent ? (isPlaying ? "Pause" : "Play") : "Play"}
                      </button>
                    </div>
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
