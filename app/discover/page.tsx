"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import ArtistPanel from "@/app/components/ArtistPanel";
import TrackCard from "@/app/components/TrackCard";
import CustomSelect from "@/app/components/CustomSelect";
import UpgradeButtons from "@/app/components/UpgradeButtons";
import { usePlayer } from "@/app/components/PlayerContext";
import {
  createArtistIdentityMap,
  enrichTracksWithArtistIdentity,
  type ArtistIdentityProfile,
  type NormalizedArtistIdentity,
  type TrackWithResolvedArtist,
} from "@/lib/artistIdentity";
import {
  SOUNDIOX_GENRES,
  isSoundioXGenre,
} from "@/lib/genres";
import { normalizeAccessPlan } from "@/lib/lifetimeCampaign";

type TrackRow = {
  id: string;
  title: string | null;
  artist: string | null;
  genre: string | null;
  audio_url: string | null;
  artwork_url: string | null;
  created_at: string | null;
  plays_all_time: number | null;
  plays_this_month: number | null;
  is_published: boolean | null;
  user_id: string | null;
};

type Playlist = {
  id: string;
  name: string;
  created_at: string;
  user_id: string;
};

type PlaylistTrackRow = {
  playlist_id: string;
  track_id: string;
};

type LikeRow = {
  track_id: string;
};

type FollowRow = {
  following_profile_id: string;
};

type TrackLikesAllTimeRow = {
  track_id: string;
  likes: number | null;
};

type ProfileMini = ArtistIdentityProfile;
type DiscoverTrack = TrackWithResolvedArtist<TrackRow>;

type ViewerProfile = {
  plan: string | null;
  is_founding: boolean | null;
  role: string | null;
};

type UpgradeTier = "premium" | "artist";

function pickTitle(t: DiscoverTrack) {
  return (t.title ?? "Untitled").toString();
}

function pickArtist(t: DiscoverTrack) {
  return t.artistDisplayName.toString();
}

function pickGenre(t: DiscoverTrack) {
  return getOfficialGenreLabel(t.genre) || "-";
}

function getArtworkSrc(t: DiscoverTrack) {
  return (t.artwork_url ?? "/logo-new.png").toString();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getOfficialGenreLabel(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  return isSoundioXGenre(raw) ? raw : "";
}

function normalizeRole(value: string | null | undefined) {
  if (value === "artist") return "artist";
  return "listener";
}

function monthStartDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

// 🔥 LISA SEE SIIA
function getTrackScore(t: DiscoverTrack) {
  const created = t.created_at ? new Date(t.created_at).getTime() : 0;
  const ageHours = created ? (Date.now() - created) / 36e5 : 999;

  return (
    (t.plays_all_time ?? 0) * 0.7 +
    (t.plays_this_month ?? 0) * 0.5 +
    Math.max(0, 24 - ageHours) * 2
  );
}

export default function DiscoverPage() {
  const router = useRouter();
  const { playTrack, currentTrack, isPlaying } = usePlayer();

  const [tracks, setTracks] = useState<DiscoverTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [authSettling, setAuthSettling] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState<UpgradeTier | null>(null);

  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("All genres");

  const [selectedTrack, setSelectedTrack] = useState<DiscoverTrack | null>(null);
  const [hasOAuthCode, setHasOAuthCode] = useState(false);

  const [viewerLoggedIn, setViewerLoggedIn] = useState(false);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [viewerRole, setViewerRole] = useState<"listener" | "artist">("listener");
  const [viewerPlan, setViewerPlan] = useState<"free" | "premium" | "artist" | "lifetime">(
    "free"
  );
  const [viewerIsFounding, setViewerIsFounding] = useState(false);

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [selectedPlaylistTrackIds, setSelectedPlaylistTrackIds] = useState<string[]>([]);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [playlistMenuOpen, setPlaylistMenuOpen] = useState(false);

  const [likesByTrackId, setLikesByTrackId] = useState<Record<string, number>>({});
  const [likedTrackIds, setLikedTrackIds] = useState<string[]>([]);
  const [likeLoadingTrackId, setLikeLoadingTrackId] = useState<string | null>(null);
  const [followingArtistIds, setFollowingArtistIds] = useState<Set<string>>(new Set());
  const [followLoadingArtistId, setFollowLoadingArtistId] = useState<string | null>(null);
  const [followerCountsByArtistId, setFollowerCountsByArtistId] = useState<
    Record<string, number>
  >({});

  const [toast, setToast] = useState<string | null>(null);

  const nowPlayingId = (currentTrack as any)?.id ?? null;
  const authReadyRef = useRef(false);

  const viewerIsArtist =
    viewerIsFounding ||
    viewerRole === "artist" ||
    viewerPlan === "artist";
  const viewerCanLike =
    viewerIsFounding ||
    viewerRole === "artist" ||
    viewerPlan === "premium" ||
    viewerPlan === "artist" ||
    viewerPlan === "lifetime";
  const viewerHasPaidPlan = viewerCanLike || viewerIsArtist;

  function showToast(text: string) {
    setToast(text);
    window.setTimeout(() => setToast(null), 2200);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setHasOAuthCode(!!params.get("code"));
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadTracks() {
      try {
        setLoading(true);

        const { data, error } = await supabase
          .from("tracks")
          .select(
            "id,title,artist,genre,audio_url,artwork_url,created_at,plays_all_time,plays_this_month,is_published,user_id"
          )
          .eq("is_published", true)
          .order("created_at", { ascending: false });

        if (error) throw error;
        if (!alive) return;

        const rawTracks = (data ?? []) as TrackRow[];

        const profileIds = Array.from(
          new Set(
            rawTracks
              .map((t) => t.user_id)
              .filter((id): id is string => typeof id === "string" && id.length > 0)
          )
        );

        let profileMap = new Map<string, NormalizedArtistIdentity>();

        if (profileIds.length > 0) {
          const { data: profiles, error: profilesError } = await supabase
            .from("profiles")
            .select("id, display_name, slug, avatar_url, is_founding")
            .in("id", profileIds);

          if (profilesError) {
            console.warn("discover profiles warning:", profilesError.message);
          } else {
            profileMap = createArtistIdentityMap((profiles ?? []) as ProfileMini[]);
          }
        }

        const merged = enrichTracksWithArtistIdentity(rawTracks, profileMap);

        setTracks(merged);

        if (merged.length > 0) {
          setSelectedTrack((prev) => prev ?? merged[0]);
        }
      } catch (e: any) {
        console.warn("discover fetch tracks warning:", {
          message: e?.message,
          details: e?.details,
          hint: e?.hint,
          code: e?.code,
        });

        if (!alive) return;
        setTracks([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    void loadTracks();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function settleAuth() {
      if (authReadyRef.current) return;

      if (hasOAuthCode) {
        setAuthSettling(true);
      }

      for (let attempt = 0; attempt < 14; attempt++) {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user?.id) {
          authReadyRef.current = true;

          if (!cancelled && hasOAuthCode) {
            router.replace("/discover");
          }

          break;
        }

        await sleep(400);
      }

      if (!authReadyRef.current) {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user?.id) {
          authReadyRef.current = true;
        }
      }

      if (!cancelled) {
        setAuthSettling(false);
      }
    }

    void settleAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session?.user?.id) {
        authReadyRef.current = true;

        if (hasOAuthCode) {
          router.replace("/discover");
        }

        setAuthSettling(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [hasOAuthCode, router]);

  useEffect(() => {
    let alive = true;

    async function loadViewerProfile() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;

        if (!user) {
          if (!alive) return;
          setViewerLoggedIn(false);
          setViewerUserId(null);
          setViewerRole("listener");
          setViewerPlan("free");
          setViewerIsFounding(false);
          return;
        }

        if (!alive) return;

        setViewerLoggedIn(true);
        setViewerUserId(user.id);

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("plan, is_founding, role")
          .eq("id", user.id)
          .maybeSingle<ViewerProfile>();

        if (profileError) throw profileError;
        if (!alive) return;

        setViewerRole(normalizeRole(profile?.role));
        setViewerPlan(normalizeAccessPlan(profile?.plan));
        setViewerIsFounding(Boolean(profile?.is_founding));
      } catch (error) {
        console.warn("discover viewer profile warning:", error);
        if (!alive) return;
        setViewerLoggedIn(false);
        setViewerUserId(null);
        setViewerRole("listener");
        setViewerPlan("free");
        setViewerIsFounding(false);
      }
    }

    void loadViewerProfile();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadViewerProfile();
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    function resetUpgradeState() {
      setUpgradeLoading(null);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        setUpgradeLoading(null);
      }
    }

    window.addEventListener("pageshow", resetUpgradeState);
    window.addEventListener("focus", resetUpgradeState);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pageshow", resetUpgradeState);
      window.removeEventListener("focus", resetUpgradeState);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadLikes() {
      try {
        const { data, error } = await supabase
          .from("track_likes_all_time")
          .select("track_id, likes");

        if (error) throw error;
        if (!alive) return;

        const map: Record<string, number> = {};

        for (const row of (data ?? []) as TrackLikesAllTimeRow[]) {
          if (row.track_id) {
            map[row.track_id] = Number(row.likes ?? 0);
          }
        }

        setLikesByTrackId(map);
      } catch (error) {
        console.warn("discover likes warning:", error);
        if (!alive) return;
        setLikesByTrackId({});
      }
    }

    void loadLikes();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadViewerLikes() {
      if (!viewerUserId) {
        setLikedTrackIds([]);
        return;
      }

      try {
        const monthStart = monthStartDateString();

        const { data, error } = await supabase
          .from("likes")
          .select("track_id")
          .eq("user_id", viewerUserId)
          .eq("month", monthStart);

        if (error) throw error;
        if (!alive) return;

        const ids = ((data ?? []) as LikeRow[])
          .map((row) => row.track_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0);

        setLikedTrackIds(ids);
      } catch (error) {
        console.warn("discover viewer likes warning:", error);
        if (!alive) return;
        setLikedTrackIds([]);
      }
    }

    void loadViewerLikes();

    return () => {
      alive = false;
    };
  }, [viewerUserId]);

  useEffect(() => {
    let alive = true;

    async function loadFollowData() {
      const artistIds = Array.from(
        new Set(
          tracks
            .map((track) => track.user_id)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
        )
      );

      if (!artistIds.length) {
        if (!alive) return;
        setFollowerCountsByArtistId({});
        setFollowingArtistIds(new Set());
        return;
      }

      try {
        const { data: countRows, error: countError } = await supabase
          .from("follows")
          .select("following_profile_id")
          .in("following_profile_id", artistIds);

        if (countError) throw countError;
        if (!alive) return;

        const counts: Record<string, number> = {};

        for (const row of (countRows ?? []) as FollowRow[]) {
          if (row.following_profile_id) {
            counts[row.following_profile_id] = (counts[row.following_profile_id] ?? 0) + 1;
          }
        }

        setFollowerCountsByArtistId(counts);

        if (!viewerUserId) {
          setFollowingArtistIds(new Set());
          return;
        }

        const { data: followRows, error: followError } = await supabase
          .from("follows")
          .select("following_profile_id")
          .eq("follower_id", viewerUserId)
          .in("following_profile_id", artistIds);

        if (followError) throw followError;
        if (!alive) return;

        const nextFollowing = new Set<string>();

        for (const row of (followRows ?? []) as FollowRow[]) {
          if (row.following_profile_id) {
            nextFollowing.add(row.following_profile_id);
          }
        }

        setFollowingArtistIds(nextFollowing);
      } catch (error) {
        console.warn("discover follow data warning:", error);
        if (!alive) return;
        setFollowerCountsByArtistId({});
        setFollowingArtistIds(new Set());
      }
    }

    void loadFollowData();

    return () => {
      alive = false;
    };
  }, [tracks, viewerUserId]);

  async function fetchPlaylists(userId: string) {
    const { data, error } = await supabase
      .from("playlists")
      .select("id,name,created_at,user_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("discover playlists warning:", error);
      setPlaylists([]);
      setSelectedPlaylistId("");
      return;
    }

    const list = (data ?? []) as Playlist[];
    setPlaylists(list);

    setSelectedPlaylistId((prev) => {
      if (prev && list.some((p) => p.id === prev)) return prev;
      return list[0]?.id ?? "";
    });
  }

  useEffect(() => {
    if (!viewerUserId) {
      setPlaylists([]);
      setSelectedPlaylistId("");
      setSelectedPlaylistTrackIds([]);
      return;
    }

    void fetchPlaylists(viewerUserId);
  }, [viewerUserId]);

  useEffect(() => {
    let alive = true;

    async function loadSelectedPlaylistTracks() {
      if (!selectedPlaylistId) {
        setSelectedPlaylistTrackIds([]);
        return;
      }

      const { data, error } = await supabase
        .from("playlist_tracks")
        .select("playlist_id, track_id")
        .eq("playlist_id", selectedPlaylistId);

      if (error) {
        console.warn("discover playlist tracks warning:", error);
        if (!alive) return;
        setSelectedPlaylistTrackIds([]);
        return;
      }

      if (!alive) return;

      const ids = ((data ?? []) as PlaylistTrackRow[])
        .map((row) => row.track_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);

      setSelectedPlaylistTrackIds(ids);
    }

    void loadSelectedPlaylistTracks();

    return () => {
      alive = false;
    };
  }, [selectedPlaylistId]);

  const genreOptions = useMemo(
    () => ["All genres", ...SOUNDIOX_GENRES],
    []
  );

  const displayedTracks = useMemo(() => {
  const q = search.trim().toLowerCase();

  const filtered = tracks.filter((t) => {
    if (genre !== "All genres" && getOfficialGenreLabel(t.genre) !== genre) {
      return false;
    }

    if (!q) return true;

    const hay = `${t.title ?? ""} ${t.artistDisplayName ?? ""} ${getOfficialGenreLabel(
      t.genre
    )}`.toLowerCase();

    return hay.includes(q);
  });

  return filtered.sort((a, b) => getTrackScore(b) - getTrackScore(a));
}, [tracks, search, genre]);

  const selectedPlaylist = useMemo(
    () => playlists.find((p) => p.id === selectedPlaylistId) ?? null,
    [playlists, selectedPlaylistId]
  );

  const selectedPlaylistTracks = useMemo(() => {
    if (!selectedPlaylistTrackIds.length) return [];

    const idSet = new Set(selectedPlaylistTrackIds);
    return tracks.filter((track) => idSet.has(track.id));
  }, [tracks, selectedPlaylistTrackIds]);

  async function createPlaylist() {
    if (!viewerUserId) {
      showToast("Please log in first");
      return;
    }

    const name = newPlaylistName.trim();

    if (!name) {
      showToast("Enter playlist name");
      return;
    }

    const { data, error } = await supabase
      .from("playlists")
      .insert([{ name, user_id: viewerUserId }])
      .select("id,name,created_at,user_id")
      .single();

    if (error) {
      console.error(error);
      showToast("Create failed");
      return;
    }

    setNewPlaylistName("");

    await fetchPlaylists(viewerUserId);

    if (data?.id) {
      setSelectedPlaylistId(data.id);
      setPlaylistMenuOpen(true);
    }

    showToast("Playlist created ✓");
  }

  async function addTrackToSelectedPlaylist(track: DiscoverTrack) {
    if (!viewerUserId) {
      showToast("Please log in first");
      return;
    }

    if (!selectedPlaylistId) {
      showToast("Choose a playlist first");
      setPlaylistMenuOpen(true);
      return;
    }

    const { error } = await supabase.from("playlist_tracks").insert([
      {
        playlist_id: selectedPlaylistId,
        track_id: track.id,
      },
    ]);

    if (error) {
      showToast("This track is already in that playlist");
      return;
    }

    setSelectedPlaylistTrackIds((prev) =>
      prev.includes(track.id) ? prev : [track.id, ...prev]
    );

    const playlistName =
      playlists.find((playlist) => playlist.id === selectedPlaylistId)?.name ?? "playlist";

    showToast(`Added to ${playlistName} ✓`);
  }

  async function toggleLike(trackId: string) {
    if (!viewerLoggedIn) {
      showToast("Log in to use likes");
      return;
    }

    if (!viewerCanLike) {
      showToast("Premium or Artist unlocks likes");
      return;
    }

    if (!viewerUserId) {
      showToast("Please log in first");
      return;
    }

    const month = monthStartDateString();
    const alreadyLiked = likedTrackIds.includes(trackId);

    try {
      setLikeLoadingTrackId(trackId);

      if (alreadyLiked) {
        const { error } = await supabase
          .from("likes")
          .delete()
          .eq("user_id", viewerUserId)
          .eq("track_id", trackId)
          .eq("month", month);

        if (error) throw error;

        setLikedTrackIds((prev) => prev.filter((id) => id !== trackId));
        setLikesByTrackId((prev) => ({
          ...prev,
          [trackId]: Math.max(0, (prev[trackId] ?? 0) - 1),
        }));
        return;
      }

      const { error } = await supabase.from("likes").insert([
        {
          user_id: viewerUserId,
          track_id: trackId,
          month,
        },
      ]);

      if (error) throw error;

      setLikedTrackIds((prev) => (prev.includes(trackId) ? prev : [...prev, trackId]));
      setLikesByTrackId((prev) => ({
        ...prev,
        [trackId]: (prev[trackId] ?? 0) + 1,
      }));
    } catch (error: any) {
      console.warn("toggle like warning:", error?.message || error);
      showToast(error?.message || "Like failed");
    } finally {
      setLikeLoadingTrackId(null);
    }
  }

  async function toggleArtistFollow(artistId: string) {
    if (!artistId) return;

    if (!viewerLoggedIn || !viewerUserId) {
      showToast("Log in to follow artists");
      return;
    }

    if (viewerUserId === artistId) {
      return;
    }

    try {
      setFollowLoadingArtistId(artistId);

      if (followingArtistIds.has(artistId)) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", viewerUserId)
          .eq("following_profile_id", artistId);

        if (error) throw error;

        setFollowingArtistIds((prev) => {
          const next = new Set(prev);
          next.delete(artistId);
          return next;
        });
        setFollowerCountsByArtistId((prev) => ({
          ...prev,
          [artistId]: Math.max(0, (prev[artistId] ?? 0) - 1),
        }));
        return;
      }

      const { error } = await supabase.from("follows").insert({
        follower_id: viewerUserId,
        following_profile_id: artistId,
      });

      if (error) throw error;

      const { error: notificationError } = await supabase
        .from("notifications")
        .insert({
          user_id: artistId,
          type: "follow",
          actor_id: viewerUserId,
        });

      if (notificationError) {
        console.warn("discover follow notification warning:", notificationError);
      }

      setFollowingArtistIds((prev) => new Set(prev).add(artistId));
      setFollowerCountsByArtistId((prev) => ({
        ...prev,
        [artistId]: (prev[artistId] ?? 0) + 1,
      }));
    } catch (error: any) {
      console.warn("discover follow toggle warning:", error?.message || error);
      showToast(error?.message || "Follow action failed");
    } finally {
      setFollowLoadingArtistId(null);
    }
  }

  async function handleUpgradePlan(plan: UpgradeTier) {
    try {
      setUpgradeLoading(plan);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (!session?.access_token) {
        setUpgradeLoading(null);
        router.push("/login");
        return;
      }

      const res = await fetch("/api/stripe/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          tier: plan,
        }),
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        setUpgradeLoading(null);
        alert(
          payload?.message ||
            payload?.error ||
            JSON.stringify(payload) ||
            "Stripe checkout failed"
        );
        return;
      }

      if (payload?.url) {
        window.location.href = payload.url;
        return;
      }

      setUpgradeLoading(null);
      alert("Checkout URL missing");
    } catch (error: any) {
      console.warn("Upgrade checkout warning:", error?.message || error);
      setUpgradeLoading(null);
      alert(error?.message || "Checkout failed");
    }
  }

  const customGenreOptions = genreOptions.map((genreValue) => ({
    value: genreValue,
    label: genreValue,
  }));

  return (
    <div className="mx-auto w-full max-w-6xl overflow-x-hidden px-4 pb-40 pt-4 sm:pt-6 md:pb-40">
      {toast ? (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-black/80 px-4 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur">
          {toast}
        </div>
      ) : null}

      {authSettling ? (
        <div className="mb-4 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
          Signing you in...
        </div>
      ) : null}

      {!viewerLoggedIn ? (
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75">
          You can listen without logging in. Log in to create playlists, upgrade, and unlock more features.
        </div>
      ) : null}

      {viewerLoggedIn && !viewerHasPaidPlan ? (
        <div className="mb-4 rounded-2xl border border-fuchsia-300/20 bg-fuchsia-400/10 px-4 py-3 text-sm text-fuchsia-100">
          Free account active. Playlists are enabled. Upgrade to Premium for likes or become an Artist to upload music.
        </div>
      ) : null}

      <div className="mb-4">
        <input
          className="h-10 w-full rounded-xl bg-white/10 px-4 text-white placeholder-white/50 ring-1 ring-white/10 outline-none focus:ring-white/20"
          placeholder="Search tracks, artists, genres..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="block lg:hidden mb-4 rounded-2xl bg-white/8 p-4 ring-1 ring-white/10">
        <div className="mb-3">
          <div className="text-base font-semibold text-white">Unlock more on SoundioX</div>
          <div className="text-sm text-white/60">
            Upgrade or join the artist campaign without scrolling through the full track list.
          </div>
        </div>

        <UpgradeButtons
          onUpgradePlan={handleUpgradePlan}
          viewerHasPaidPlan={viewerHasPaidPlan}
        />
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="hidden lg:block" />

        <div className="flex w-full flex-col gap-3 lg:w-auto lg:flex-row lg:items-center">
          <CustomSelect
            value={genre}
            onChange={setGenre}
            options={customGenreOptions}
            className="w-full lg:w-[220px]"
          />

          <div className="relative w-full lg:w-[240px]">
            <button
              type="button"
              onClick={() => setPlaylistMenuOpen((prev) => !prev)}
              className="flex h-10 w-full items-center justify-between rounded-xl bg-gradient-to-r from-cyan-400 to-sky-400 px-4 text-sm font-semibold text-white ring-1 ring-cyan-200/40 backdrop-blur transition hover:opacity-95"
            >
              <span className="truncate">
                {selectedPlaylist ? `Playlist: ${selectedPlaylist.name}` : "My Playlists"}
              </span>
              <span className="ml-3 text-xs text-white/90">▼</span>
            </button>

            {playlistMenuOpen ? (
              <div className="absolute right-0 top-12 z-40 w-full rounded-2xl bg-[#89d7ff]/95 p-3 text-white shadow-2xl ring-1 ring-white/20 backdrop-blur">
                {!viewerLoggedIn ? (
                  <div className="text-sm font-semibold text-white/90">
                    Log in to create and use playlists.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      {playlists.length === 0 ? (
                        <div className="rounded-xl bg-white/15 px-3 py-2 text-sm font-medium text-white/90">
                          No playlists yet.
                        </div>
                      ) : (
                        playlists.map((playlist) => {
                          const isActive = playlist.id === selectedPlaylistId;

                          return (
                            <button
                              key={playlist.id}
                              type="button"
                              onClick={() => {
                                setSelectedPlaylistId(playlist.id);
                                setPlaylistMenuOpen(false);
                              }}
                              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${
                                isActive
                                  ? "bg-white/25 text-white"
                                  : "bg-white/10 text-white/95 hover:bg-white/20"
                              }`}
                            >
                              <span className="truncate">{playlist.name}</span>
                              {isActive ? <span className="text-[10px]">OPEN</span> : null}
                            </button>
                          );
                        })
                      )}
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        value={newPlaylistName}
                        onChange={(e) => setNewPlaylistName(e.target.value)}
                        placeholder="New playlist..."
                        className="h-10 flex-1 rounded-xl bg-white/15 px-3 text-sm font-medium text-white placeholder:text-white/60 outline-none ring-1 ring-white/15"
                      />
                      <button
                        type="button"
                        onClick={createPlaylist}
                        className="h-10 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-500 px-4 text-sm font-bold text-white ring-1 ring-white/15"
                      >
                        Create
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {selectedPlaylist ? (
        <div className="mb-4 rounded-2xl bg-white/8 p-3 ring-1 ring-white/10">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-white">
                {selectedPlaylist.name}
              </div>
              <div className="text-xs font-semibold text-white/55">
                {selectedPlaylistTracks.length} track
                {selectedPlaylistTracks.length === 1 ? "" : "s"}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedPlaylistId("")}
              className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 ring-1 ring-white/10 transition hover:bg-white/15"
            >
              Close
            </button>
          </div>

          {selectedPlaylistTracks.length === 0 ? (
            <div className="text-sm text-white/60">
              This playlist is empty. Use Add on any track to start filling it.
            </div>
          ) : (
            <div className="space-y-2">
              {selectedPlaylistTracks.map((track) => (
                <div
                  key={track.id}
                  className="flex flex-col gap-3 rounded-xl bg-white/8 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-white">
                      {track.title ?? "Untitled"}
                    </div>
                    <div className="truncate text-xs font-semibold text-white/55">
                      {track.artistDisplayName}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTrack(track);
                      void playTrack(track as any, selectedPlaylistTracks as any);
                    }}
                    className="self-start rounded-xl bg-gradient-to-r from-purple-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 sm:self-auto"
                  >
                    Play
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-2xl bg-white/6 p-3 ring-1 ring-white/10">
          <div className="mb-2 flex items-center justify-between px-2">
            <div className="font-semibold text-white/90">Discover</div>
            <div className="text-sm text-white/50">
              {loading ? "Loading..." : `${displayedTracks.length} tracks`}
            </div>
          </div>

          <div className="space-y-2">
            {loading ? (
              <div className="px-2 py-6 text-white/60">Loading tracks…</div>
            ) : displayedTracks.length === 0 ? (
              <div className="px-2 py-6 text-white/60">No tracks found.</div>
            ) : (
              displayedTracks.map((t) => (
                <TrackCard
                  key={t.id}
                  track={t as any}
                  allTracks={displayedTracks as any}
                  onPlay={() => {
                    setSelectedTrack(t);
                    void playTrack(t as any, displayedTracks as any);
                  }}
                  onAdd={() => void addTrackToSelectedPlaylist(t)}
                  onLike={() => void toggleLike(t.id)}
                  onFollow={() => void toggleArtistFollow(t.user_id ?? "")}
                  likeCount={likesByTrackId[t.id] ?? 0}
                  isLiked={likedTrackIds.includes(t.id)}
                  likeLoading={likeLoadingTrackId === t.id}
                  canLike={viewerCanLike}
                  artistId={t.user_id}
                  showFollowButton={Boolean(t.user_id && t.user_id !== viewerUserId)}
                  isFollowing={Boolean(t.user_id && followingArtistIds.has(t.user_id))}
                  followLoading={followLoadingArtistId === t.user_id}
                />
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white/8 p-3 ring-1 ring-white/10">
          <ArtistPanel
            artistName={selectedTrack ? pickArtist(selectedTrack) : "AI Artist"}
            genre={selectedTrack ? pickGenre(selectedTrack) : "-"}
            selectedTitle={selectedTrack ? pickTitle(selectedTrack) : "No track selected"}
            artworkSrc={selectedTrack ? getArtworkSrc(selectedTrack) : "/logo-new.png"}
            artistProfileId={selectedTrack?.user_id ?? null}
            artistSlug={selectedTrack?.artistSlug ?? null}
            followerCount={
              selectedTrack?.user_id ? followerCountsByArtistId[selectedTrack.user_id] ?? 0 : 0
            }
            isFollowing={Boolean(
              selectedTrack?.user_id && followingArtistIds.has(selectedTrack.user_id)
            )}
            followLoading={Boolean(
              selectedTrack?.user_id && followLoadingArtistId === selectedTrack.user_id
            )}
            showFollowButton={Boolean(
              selectedTrack?.user_id && selectedTrack.user_id !== viewerUserId
            )}
            tracks={displayedTracks as any}
            onSelectTrack={(t: any) => {
              setSelectedTrack(t);
              void playTrack(t, displayedTracks as any);
            }}
            onPlayClick={(t: any) => {
              setSelectedTrack(t);
              void playTrack(t, displayedTracks as any);
            }}
            onToggleFollow={toggleArtistFollow}
            isPlaying={isPlaying}
            currentTrackId={nowPlayingId}
            selectedTrack={selectedTrack as any}
            onUpgradePlan={handleUpgradePlan}
            viewerHasPaidPlan={viewerHasPaidPlan}
          />

          {upgradeLoading ? (
            <div className="mt-3 text-center text-xs text-white/50">
              Opening checkout...
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
