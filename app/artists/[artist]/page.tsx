"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { usePlayer } from "../../components/PlayerContext";

type ProfileArtistRow = {
  id: string;
  role?: string | null;
  display_name: string | null;
  slug: string | null;
  bio: string | null;
  avatar_url: string | null;
  country: string | null;
  plan: string | null;
  is_founding: boolean | null;
  created_at?: string | null;
};

type TrackRow = {
  id: string;
  title: string;
  artist: string | null;
  genre: string | null;
  isrc: string | null;
  audio_url: string;
  artwork_url: string | null;
  created_at: string | null;
  plays_all_time: number | null;
  plays_this_month: number | null;
  user_id: string | null;
};

type TrackLikeMonthlyRow = {
  track_id: string;
  month: string;
  likes: number;
};

type TrackLikeAllTimeRow = {
  track_id: string;
  likes: number;
};

type FollowRow = {
  follower_id: string;
  following_profile_id: string;
  created_at?: string | null;
};

function formatDateShort(dateStr?: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = d.toLocaleString("en-US", { month: "short" });
  const yyyy = d.getFullYear();
  return `${dd} ${mm} ${yyyy}`;
}

function monthStartISO(d = new Date()) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  const yyyy = x.getFullYear();
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

function normalizeSlug(value: string) {
  return decodeURIComponent(value || "").trim().toLowerCase();
}

export default function ArtistPage() {
  const router = useRouter();
  const params = useParams();
  const slug = normalizeSlug(String(params?.artist || ""));
  const { playTrack } = usePlayer();

  const [loading, setLoading] = useState(true);
  const [artist, setArtist] = useState<ProfileArtistRow | null>(null);
  const [tracks, setTracks] = useState<TrackRow[]>([]);
  const [likesMonth, setLikesMonth] = useState<number>(0);
  const [likesAllTime, setLikesAllTime] = useState<number>(0);
  const [donateLoading, setDonateLoading] = useState<number | null>(null);
  const [showDonateMenu, setShowDonateMenu] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [copiedIsrcTrackId, setCopiedIsrcTrackId] = useState<string | null>(null);

  const playsMonth = useMemo(
    () => tracks.reduce((sum, t) => sum + (t.plays_this_month || 0), 0),
    [tracks]
  );

  const playsAllTime = useMemo(
    () => tracks.reduce((sum, t) => sum + (t.plays_all_time || 0), 0),
    [tracks]
  );

  const firstRelease = useMemo(() => {
    if (!tracks.length) return null;
    const sorted = [...tracks].sort((a, b) => {
      const da = a.created_at ? new Date(a.created_at).getTime() : 0;
      const db = b.created_at ? new Date(b.created_at).getTime() : 0;
      return da - db;
    });
    return sorted[0];
  }, [tracks]);

  const latestRelease = useMemo(() => {
    if (!tracks.length) return null;
    const sorted = [...tracks].sort((a, b) => {
      const da = a.created_at ? new Date(a.created_at).getTime() : 0;
      const db = b.created_at ? new Date(b.created_at).getTime() : 0;
      return db - da;
    });
    return sorted[0];
  }, [tracks]);

  const mostPlayedAllTime = useMemo(() => {
    if (!tracks.length) return null;
    const sorted = [...tracks].sort(
      (a, b) => (b.plays_all_time || 0) - (a.plays_all_time || 0)
    );
    return sorted[0];
  }, [tracks]);

  const genreSummary = useMemo(() => {
    const counts = new Map<string, number>();

    for (const track of tracks) {
      const g = (track.genre || "").trim();
      if (!g) continue;
      counts.set(g, (counts.get(g) || 0) + 1);
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);
  }, [tracks]);

  async function handleDonate(artistSlug: string, amountCents: number) {
    try {
      setDonateLoading(amountCents);

      const res = await fetch("/api/stripe/donate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artistSlug, amount: amountCents }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Donate failed");
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (e: any) {
      alert(e?.message || "Donate failed");
    } finally {
      setDonateLoading(null);
      setShowDonateMenu(false);
    }
  }

  async function handleCopyIsrc(trackId: string, isrc: string) {
    try {
      await navigator.clipboard.writeText(isrc);
      setCopiedIsrcTrackId(trackId);
      window.setTimeout(() => {
        setCopiedIsrcTrackId((current) => (current === trackId ? null : current));
      }, 1800);
    } catch (error) {
      console.error("isrc copy failed:", error);
    }
  }

  async function loadFollowState(artistId: string, currentViewerId: string | null) {
    const { count, error: countError } = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("following_profile_id", artistId);

    if (countError) {
      console.error("artist follower count load error:", countError);
    }

    setFollowerCount(count || 0);

    if (!currentViewerId || currentViewerId === artistId) {
      setIsFollowing(false);
      return;
    }

    const { data: followRow, error: followError } = await supabase
      .from("follows")
      .select("follower_id, following_profile_id")
      .eq("follower_id", currentViewerId)
      .eq("following_profile_id", artistId)
      .maybeSingle<FollowRow>();

    if (followError) {
      console.error("artist follow state load error:", followError);
      setIsFollowing(false);
      return;
    }

    setIsFollowing(Boolean(followRow));
  }

  async function handleToggleFollow() {
    if (!artist?.id) return;

    if (!viewerId) {
      router.push("/login");
      return;
    }

    if (viewerId === artist.id) {
      return;
    }

    setFollowLoading(true);

    try {
      if (isFollowing) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", viewerId)
          .eq("following_profile_id", artist.id);

        if (error) throw error;

        setIsFollowing(false);
        setFollowerCount((prev) => Math.max(0, prev - 1));
      } else {
        const { error } = await supabase.from("follows").insert({
          follower_id: viewerId,
          following_profile_id: artist.id,
        });

        if (error) throw error;

        const { error: notificationError } = await supabase
          .from("notifications")
          .insert({
            user_id: artist.id,
            type: "follow",
            actor_id: viewerId,
          });

        if (notificationError) {
          console.error("follow notification insert error:", notificationError);
        }

        setIsFollowing(true);
        setFollowerCount((prev) => prev + 1);
      }
    } catch (error: any) {
      console.error("artist follow toggle error:", error);
      alert(error?.message || "Follow action failed");
    } finally {
      setFollowLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setNotFound(false);
      setShowDonateMenu(false);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!cancelled) {
        setViewerId(user?.id ?? null);
      }

      const { data: artistData, error: artistErr } = await supabase
        .from("profiles")
        .select(
          "id, role, display_name, slug, bio, avatar_url, country, plan, is_founding, created_at"
        )
        .eq("slug", slug)
        .eq("role", "artist")
        .maybeSingle();

      if (artistErr) {
        console.error("artist profile load error:", artistErr);
      }
      if (cancelled) return;

      const a = (artistData as ProfileArtistRow) || null;
      setArtist(a);

      if (!a?.id) {
        setNotFound(true);
        setTracks([]);
        setLikesMonth(0);
        setLikesAllTime(0);
        setFollowerCount(0);
        setIsFollowing(false);
        setLoading(false);
        return;
      }

      await loadFollowState(a.id, user?.id ?? null);

      const { data: trackData, error: trackErr } = await supabase
        .from("tracks")
        .select(
          "id,title,artist,genre,isrc,audio_url,artwork_url,created_at,plays_all_time,plays_this_month,user_id"
        )
        .eq("user_id", a.id)
        .eq("is_published", true)
        .order("created_at", { ascending: false });

      if (trackErr) {
        console.error("artist tracks load error:", trackErr);
      }
      if (cancelled) return;

      const t = ((trackData as TrackRow[]) || []).filter(Boolean);
      setTracks(t);

      const trackIds = t.map((x) => x.id);
      if (!trackIds.length) {
        setLikesMonth(0);
        setLikesAllTime(0);
        setLoading(false);
        return;
      }

      const monthStart = monthStartISO(new Date());

      const { data: monthRows, error: monthErr } = await supabase
        .from("track_likes_monthly")
        .select("track_id,month,likes")
        .eq("month", monthStart)
        .in("track_id", trackIds);

      if (monthErr) {
        console.error("monthly likes load error:", monthErr);
      }
      if (cancelled) return;

      const lm = ((monthRows as TrackLikeMonthlyRow[]) || []).reduce(
        (sum, r) => sum + (r.likes || 0),
        0
      );
      setLikesMonth(lm);

      const { data: allRows, error: allErr } = await supabase
        .from("track_likes_all_time")
        .select("track_id,likes")
        .in("track_id", trackIds);

      if (allErr) {
        console.error("all time likes load error:", allErr);
      }
      if (cancelled) return;

      const la = ((allRows as TrackLikeAllTimeRow[]) || []).reduce(
        (sum, r) => sum + (r.likes || 0),
        0
      );
      setLikesAllTime(la);

      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const donateEnabled = true;
  const isFounding = Boolean(artist?.is_founding);
  const isArtist = artist?.plan === "artist" || artist?.role === "artist";
  const isOwnProfile = Boolean(viewerId && artist?.id && viewerId === artist.id);

  if (!loading && notFound) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-8">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-xl">
          <div className="text-2xl font-semibold text-white">Artist not found</div>
          <div className="mt-2 text-sm text-white/65">
            This profile could not be loaded from the current artist slug.
          </div>
          <button
            onClick={() => router.push("/artists")}
            className="mt-5 h-10 rounded-xl bg-white/10 px-4 text-sm font-medium text-white hover:bg-white/15"
          >
            Back to Artists
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-8">
      <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur-xl">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex gap-4">
            {isFounding ? (
              <div className="rounded-[22px] bg-gradient-to-r from-cyan-400 to-fuchsia-500 p-[2px] shadow-[0_0_28px_rgba(56,189,248,0.18)]">
                <div className="relative h-[72px] w-[72px] overflow-hidden rounded-[20px] bg-white/5">
                  {artist?.avatar_url ? (
                    <Image
                      src={artist.avatar_url}
                      alt={artist.display_name || "Artist"}
                      fill
                      className="object-cover"
                      sizes="72px"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl text-white/50">
                      🎵
                    </div>
                  )}

                  <div className="absolute bottom-1.5 right-1.5 rounded-full border border-black/20 bg-black/55 px-1.5 py-[2px] text-[10px] font-semibold text-cyan-200 backdrop-blur">
                    ★
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative h-[72px] w-[72px] overflow-hidden rounded-[20px] border border-white/10 bg-white/5">
                {artist?.avatar_url ? (
                  <Image
                    src={artist.avatar_url}
                    alt={artist.display_name || "Artist"}
                    fill
                    className="object-cover"
                    sizes="72px"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl text-white/50">
                    🎵
                  </div>
                )}
              </div>
            )}

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-semibold tracking-tight text-white">
                  {artist?.display_name || "Artist"}
                </h1>

                {isFounding ? (
                  <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
                    Founding Artist
                  </span>
                ) : null}

                {isArtist && !isFounding ? (
                  <span className="rounded-full border border-fuchsia-300/30 bg-fuchsia-400/10 px-3 py-1 text-xs font-medium text-fuchsia-200">
                    Artist
                  </span>
                ) : null}

                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                  {followerCount} follower{followerCount === 1 ? "" : "s"}
                </span>
              </div>

              <div className="mt-2 text-sm text-white/70">
                Plays (month): <span className="text-white/90">{playsMonth}</span> • All time:{" "}
                <span className="text-white/90">{playsAllTime}</span> • Reward pool:{" "}
                <span className="text-white/90">{likesMonth} likes</span>
              </div>

              {genreSummary.length > 0 ? (
                <div className="mt-2 text-sm text-white/60">
                  Genres: <span className="text-white/85">{genreSummary.join(" • ")}</span>
                </div>
              ) : null}

              {artist?.bio ? (
                <p className="mt-3 max-w-2xl text-sm text-white/70">{artist.bio}</p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {artist?.country ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
                    {artist.country}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center justify-end gap-2">
              {!isOwnProfile ? (
                <button
                  onClick={handleToggleFollow}
                  disabled={followLoading || !artist?.id}
                  className={`h-10 rounded-xl px-4 text-sm font-semibold transition ${
                    isFollowing
                      ? "bg-white/10 text-white hover:bg-white/15"
                      : "bg-gradient-to-r from-cyan-400 to-fuchsia-500 text-black hover:opacity-95"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {followLoading ? "Saving..." : isFollowing ? "Following" : "Follow"}
                </button>
              ) : null}

              {donateEnabled ? (
                <div className="relative">
                  <button
                    onClick={() => setShowDonateMenu((prev) => !prev)}
                    className="h-10 rounded-xl bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-4 text-sm font-semibold text-black hover:opacity-95"
                  >
                    Support artist
                  </button>

                  {showDonateMenu ? (
                    <div className="absolute right-0 top-12 z-30 min-w-[190px] rounded-2xl border border-white/10 bg-[#0c1018]/95 p-2 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                      <button
                        onClick={() => handleDonate(slug, 300)}
                        disabled={donateLoading !== null}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-60"
                      >
                        <span>Support with EUR3</span>
                        <span>{donateLoading === 300 ? "…" : ""}</span>
                      </button>

                      <button
                        onClick={() => handleDonate(slug, 500)}
                        disabled={donateLoading !== null}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-60"
                      >
                        <span>Support with EUR5</span>
                        <span>{donateLoading === 500 ? "…" : ""}</span>
                      </button>

                      <button
                        onClick={() => handleDonate(slug, 1000)}
                        disabled={donateLoading !== null}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-60"
                      >
                        <span>Support with EUR10</span>
                        <span>{donateLoading === 1000 ? "…" : ""}</span>
                      </button>

                      <button
                        onClick={() => handleDonate(slug, 2000)}
                        disabled={donateLoading !== null}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-60"
                      >
                        <span>Support with EUR20</span>
                        <span>{donateLoading === 2000 ? "…" : ""}</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <button
                onClick={() => router.push("/artists")}
                className="h-10 rounded-xl bg-white/10 px-4 text-sm font-medium text-white hover:bg-white/15"
              >
                Back
              </button>
            </div>

            {donateEnabled ? (
              <div className="text-xs text-white/60">70% goes directly to the creator</div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-white">Tracks</div>
          {loading ? (
            <div className="text-xs text-white/60">Loading…</div>
          ) : (
            <div className="text-xs text-white/60">
              {tracks.length} track{tracks.length === 1 ? "" : "s"}
            </div>
          )}
        </div>

        {tracks.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-white/70">
            No tracks found for this artist.
          </div>
        ) : (
          <div className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10">
            {tracks.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 bg-black/20 p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="relative h-12 w-12 flex-none overflow-hidden rounded-xl border border-white/10 bg-white/5">
                    {t.artwork_url ? (
                      <Image
                        src={t.artwork_url}
                        alt={t.title}
                        fill
                        className="object-cover"
                        sizes="48px"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-white/40">
                        ♪
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{t.title}</div>
                    <div className="truncate text-xs text-white/60">
                      {t.genre || "—"} • {formatDateShort(t.created_at)}
                    </div>
                    {t.isrc ? (
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/55">
                        <span className="font-medium text-white/75">ISRC: {t.isrc}</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (!t.isrc) return;
                            void handleCopyIsrc(t.id, t.isrc);
                          }}
                          className="rounded-lg bg-white/10 px-2 py-1 text-[11px] font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/15"
                        >
                          {copiedIsrcTrackId === t.id ? "Copied" : "Copy ISRC"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-none items-center gap-2">
                  <div className="hidden text-right text-xs text-white/60 md:block">
                    <div>{t.plays_this_month || 0} plays (month)</div>
                    <div>{t.plays_all_time || 0} plays (all)</div>
                  </div>

                  <button
                    onClick={() => playTrack(t as any, tracks as any)}
                    className="h-9 rounded-xl bg-white/10 px-4 text-sm font-medium text-white hover:bg-white/15"
                  >
                    Play
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6">
        <div className="mb-3 text-xs font-semibold tracking-[0.18em] text-white/55">
          CAREER STATS
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <div className="text-xs text-white/60">Joined</div>
            <div className="mt-2 text-2xl font-semibold text-white">
              {formatDateShort(artist?.created_at)}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <div className="text-xs text-white/60">Tracks</div>
            <div className="mt-2 text-2xl font-semibold text-white">{tracks.length}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <div className="text-xs text-white/60">Followers</div>
            <div className="mt-2 text-2xl font-semibold text-white">{followerCount}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <div className="text-xs text-white/60">All-time plays</div>
            <div className="mt-2 text-2xl font-semibold text-white">{playsAllTime}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <div className="text-xs text-white/60">Reward pool</div>
            <div className="mt-2 text-2xl font-semibold text-white">{likesMonth} likes</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <div className="text-xs text-white/60">First release</div>
            <div className="mt-2 text-lg font-semibold text-white">
              {formatDateShort(firstRelease?.created_at)}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <div className="text-xs text-white/60">Latest release</div>
            <div className="mt-2 text-lg font-semibold text-white">
              {formatDateShort(latestRelease?.created_at)}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <div className="text-xs text-white/60">Top track</div>
            <div className="mt-2 text-lg font-semibold text-white">
              {mostPlayedAllTime?.title || "—"}
            </div>
            <div className="mt-1 text-xs text-white/60">
              {(mostPlayedAllTime?.plays_all_time || 0) + " plays"}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <div className="text-xs text-white/60">Likes</div>
            <div className="mt-2 text-lg font-semibold text-white">{likesAllTime} all-time</div>
            <div className="mt-1 text-xs text-white/60">{likesMonth} this month</div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
        <div className="mb-3 text-sm font-semibold text-white">Timeline</div>

        {tracks.length === 0 ? (
          <div className="text-sm text-white/70">No timeline yet.</div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs text-white/60">Released track</div>
              <div className="mt-1 text-sm font-semibold text-white">
                {latestRelease?.title || "—"}
              </div>
              <div className="mt-1 text-xs text-white/60">
                {formatDateShort(latestRelease?.created_at)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
