"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { usePlayer } from "@/app/components/PlayerContext";
import CustomSelect from "@/app/components/CustomSelect";
import { normalizeAccessPlan } from "@/lib/lifetimeCampaign";

type SortKey = "plays_month" | "likes_month";
type CategoryKey = "global" | "new_rising" | "estonia";

type PulseTrack = {
  id: string;
  title: string | null;
  artist: string | null;
  genre: string | null;
  created_at: string | null;
  plays_this_month: number | null;
  artwork_url?: string | null;
  cover_url?: string | null;
  image_url?: string | null;
  artwork?: string | null;
  cover?: string | null;
  image?: string | null;
  user_id: string | null;
  is_published?: boolean | null;
  artistDisplayName: string;
  artistSlug: string | null;
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

const MONTHLY_LIKE_LIMIT = 100;

function monthStartISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
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

function normalizeGenre(value: string | null | undefined) {
  const raw = safeStr(value).trim();
  if (!raw) return "";

  const lower = raw.toLowerCase();

  if (
    lower === "classical / cine" ||
    lower === "classical/cine" ||
    lower === "classical / cinematic" ||
    lower === "classical/cinematic"
  ) {
    return "Classical / Cinematic";
  }

  return raw;
}

function normalizeRole(value: string | null | undefined) {
  if (value === "artist") return "artist";
  return "listener";
}

export default function PulsePage() {
  const router = useRouter();
  const { playTrack, currentTrack, isPlaying, toggle } = usePlayer();

  const [tracks, setTracks] = useState<PulseTrack[]>([]);
  const [likesMonth, setLikesMonth] = useState<Map<string, number>>(new Map());
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

  const [sort, setSort] = useState<SortKey>("plays_month");
  const [category, setCategory] = useState<CategoryKey>("global");
  const [genre, setGenre] = useState<string>("All genres");
  const [q, setQ] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState("");
  const month = useMemo(() => monthStartISO(), []);

  const viewerCanLike =
    viewerIsFounding ||
    viewerRole === "artist" ||
    viewerPlan === "premium" ||
    viewerPlan === "artist" ||
    viewerPlan === "lifetime";

  const likesRemaining = Math.max(0, MONTHLY_LIKE_LIMIT - viewerLikesUsed);

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

      const { data: myMonthLikes, error: myMonthLikesError } = await supabase
        .from("likes")
        .select("track_id")
        .eq("user_id", user.id)
        .eq("month", month);

      if (myMonthLikesError) {
        console.warn("Pulse monthly usage warning:", myMonthLikesError);
        if (!alive) return;
        setViewerLikesUsed(0);
      } else {
        if (!alive) return;
        setViewerLikesUsed((myMonthLikes ?? []).length);
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
    const load = async () => {
      setLoading(true);

      const { data: tRows, error: tErr } = await supabase
        .from("tracks")
        .select("*")
        .eq("is_published", true);

      if (tErr) {
        console.error("Pulse tracks error:", tErr);
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
              artistSlug:
                profile?.slug && safeStr(profile.slug).trim()
                  ? safeStr(profile.slug).trim()
                  : null,
            };
          });

          if (category === "estonia") {
            const estoniaOnly = enrichedTracks.filter((track) => {
              const profile = track.user_id ? profileMap.get(track.user_id) : undefined;
              const country = safeStr(profile?.country).trim().toLowerCase();
              return country === "estonia" || country === "eesti";
            });
            enrichedTracks = estoniaOnly;
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
        const { data: likeRows, error: likeErr } = await supabase
          .from("likes")
          .select("track_id")
          .eq("month", month)
          .in("track_id", ids);

        if (likeErr) {
          console.warn("Pulse likes query error:", likeErr);
        }

        const map = new Map<string, number>();
        (likeRows ?? []).forEach((row: { track_id: string }) => {
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

        if (myErr) {
          console.warn("Pulse my likes error:", myErr);
        }

        const set = new Set<string>();
        (myLikes ?? []).forEach((r: { track_id: string }) => set.add(String(r.track_id)));
        setLikedSet(set);
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
  }, [userId, month, category]);

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
      const g = normalizeGenre(t.genre);
      if (g) set.add(g);
    }
    return ["All genres", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [tracks]);

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

      if (genre !== "All genres" && normalizeGenre(t.genre) !== genre) {
        return false;
      }

      if (!s) {
        return true;
      }

      const hay = `${safeStr(t.title)} ${safeStr(t.artistDisplayName)} ${safeStr(
        t.artist
      )} ${normalizeGenre(t.genre)}`.toLowerCase();

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

  async function toggleLike(trackId: string) {
    setActionMessage("");

    if (!userId) {
      router.push("/login");
      return;
    }

    const track = tracks.find((item) => String(item.id) === String(trackId));
    const liked = likedSet.has(trackId);

    if (liked) {
      const { error } = await supabase
        .from("likes")
        .delete()
        .eq("user_id", userId)
        .eq("track_id", trackId)
        .eq("month", month);

      if (error) {
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
      setActionMessage("Your monthly like limit has been reached.");
      return;
    }

    const { error } = await supabase.from("likes").insert({
      user_id: userId,
      track_id: trackId,
      month,
    });

    if (error) {
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
          Free account active. You can listen and create playlists. Upgrade to Premium for likes or become an Artist to upload and like tracks.
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

      <div className="overflow-hidden rounded-2xl bg-white/10 ring-1 ring-white/10">
        <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-semibold tracking-widest text-white/60">
          <div className="col-span-5">TRACK</div>
          <div className="col-span-2 text-right">PLAYS</div>
          <div className="col-span-2 text-right">LIKES</div>
          <div className="col-span-3 text-right">ACTION</div>
        </div>

        {loading ? (
          <div className="p-4 text-white/60">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-4 text-white/60">No tracks.</div>
        ) : (
          rows.map((t, idx) => {
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

                <div className="grid grid-cols-12 items-center gap-2">
                  <div className="col-span-5 flex min-w-0 items-center gap-3">
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
                        {t.artistSlug ? (
                          <Link
                            href={`/artists/${encodeURIComponent(t.artistSlug)}`}
                            className="hover:text-white"
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
                              className="text-sm text-white/60 transition hover:text-white disabled:opacity-60"
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
                        {normalizeGenre(t.genre) || "-"}
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
                      } ${!liked && (!userId || isOwnTrack || !viewerCanLike || likesRemaining <= 0) ? "opacity-50" : ""}`}
                      title={likeDisabledReason}
                    >
                      ♥
                    </button>
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
