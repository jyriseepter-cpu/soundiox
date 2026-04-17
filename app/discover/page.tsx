"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
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
import { SOUNDIOX_GENRES, isSoundioXGenre } from "@/lib/genres";
import { normalizeAccessPlan } from "@/lib/lifetimeCampaign";
import { formatEuroPrice, SOUNDIOX_PRICING } from "@/lib/pricing";
import {
  addTrackToPlaylist as addTrackToPlaylistEntry,
  broadcastTrackLikeChanged,
  fetchUserLikedTrackIds,
  fetchUserPlaylists,
  likeTrack,
  unlikeTrack,
} from "@/lib/trackEngagement";

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
  is_promo: boolean | null;
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

type FollowRow = {
  following_profile_id: string;
};

type TrackLikesAllTimeRow = {
  track_id: string;
  likes: number | null;
};

type TrackLikesMonthlyRow = {
  track_id: string;
  month: string | null;
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

const MONTHLY_LIKE_LIMIT = 100;
const PAGE_SIZE = 50;

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

function monthStartDateString(offsetMonths = 0) {
  const now = new Date();
  now.setDate(1);
  now.setMonth(now.getMonth() + offsetMonths);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

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
  const { playTrack } = usePlayer();

  const [tracks, setTracks] = useState<DiscoverTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [authSettling, setAuthSettling] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState<UpgradeTier | null>(null);

  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("All genres");
  const [page, setPage] = useState(1);

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
  const [playlistTrackCountsByPlaylistId, setPlaylistTrackCountsByPlaylistId] = useState<
    Record<string, number>
  >({});
  const [newPlaylistName, setNewPlaylistName] = useState("");

  const [likesMonthByTrackId, setLikesMonthByTrackId] = useState<Record<string, number>>({});
  const [likesAllTimeByTrackId, setLikesAllTimeByTrackId] = useState<Record<string, number>>({});
  const [previousMonthWinnerTrackId, setPreviousMonthWinnerTrackId] = useState<string | null>(
    null
  );
  const [likedTrackIds, setLikedTrackIds] = useState<string[]>([]);
  const [likeLoadingTrackId, setLikeLoadingTrackId] = useState<string | null>(null);
  const [followingArtistIds, setFollowingArtistIds] = useState<Set<string>>(new Set());
  const [followLoadingArtistId, setFollowLoadingArtistId] = useState<string | null>(null);
  const [followerCountsByArtistId, setFollowerCountsByArtistId] = useState<
    Record<string, number>
  >({});

  const [toast, setToast] = useState<string | null>(null);

  const authReadyRef = useRef(false);
  const likedTrackIdsRef = useRef<string[]>([]);

  const viewerIsArtist =
    viewerIsFounding || viewerRole === "artist" || viewerPlan === "artist";
  const viewerCanLike =
    viewerIsFounding ||
    viewerRole === "artist" ||
    viewerPlan === "premium" ||
    viewerPlan === "artist" ||
    viewerPlan === "lifetime";
  const viewerHasPaidPlan = viewerCanLike || viewerIsArtist;
  const likesRemaining = Math.max(0, MONTHLY_LIKE_LIMIT - likedTrackIds.length);

  function showToast(text: string) {
    setToast(text);
    window.setTimeout(() => setToast(null), 2200);
  }

  useEffect(() => {
    likedTrackIdsRef.current = likedTrackIds;
  }, [likedTrackIds]);

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
            "id,title,artist,genre,audio_url,artwork_url,created_at,plays_all_time,plays_this_month,is_published,is_promo,user_id"
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

        setLikesAllTimeByTrackId(map);
      } catch (error) {
        console.warn("discover likes warning:", error);
        if (!alive) return;
        setLikesAllTimeByTrackId({});
      }
    }

    void loadLikes();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadMonthlyLikes() {
      const trackIds = tracks.map((track) => track.id).filter(Boolean);

      if (!trackIds.length) {
        setLikesMonthByTrackId({});
        return;
      }

      try {
        const response = await fetch("/api/pulse-like-counts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ trackIds }),
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error || "Could not load monthly likes");
        }
        if (!alive) return;

        const map: Record<string, number> = {};
        const counts = payload?.counts as Record<string, number> | undefined;

        Object.entries(counts ?? {}).forEach(([trackId, likes]) => {
          const safeTrackId = String(trackId || "").trim();
          if (!safeTrackId) return;
          map[safeTrackId] = Number(likes ?? 0);
        });

        setLikesMonthByTrackId(map);
      } catch (error) {
        console.warn("discover monthly likes warning:", error);
        if (!alive) return;
        setLikesMonthByTrackId({});
      }
    }

    void loadMonthlyLikes();

    return () => {
      alive = false;
    };
  }, [tracks]);

  useEffect(() => {
    let alive = true;

    async function loadPreviousMonthWinner() {
      const trackIds = tracks.map((track) => track.id).filter(Boolean);

      if (!trackIds.length) {
        setPreviousMonthWinnerTrackId(null);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("track_likes_monthly")
          .select("track_id,month,likes")
          .eq("month", monthStartDateString(-1))
          .in("track_id", trackIds)
          .order("likes", { ascending: false })
          .limit(1);

        if (error) throw error;
        if (!alive) return;

        const winner = ((data ?? []) as TrackLikesMonthlyRow[]).find(
          (row) => typeof row.track_id === "string" && row.track_id.length > 0
        );

        setPreviousMonthWinnerTrackId(winner?.track_id ?? null);
      } catch (error) {
        console.warn("discover previous winner warning:", error);
        if (!alive) return;
        setPreviousMonthWinnerTrackId(null);
      }
    }

    void loadPreviousMonthWinner();

    return () => {
      alive = false;
    };
  }, [tracks]);

  useEffect(() => {
    let alive = true;

    async function loadViewerLikes() {
      if (!viewerUserId) {
        setLikedTrackIds([]);
        return;
      }

      try {
        const ids = await fetchUserLikedTrackIds(viewerUserId);
        if (!alive) return;

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
    if (typeof window === "undefined") return;

    function handleTrackLikeChanged(event: Event) {
      const detail = (event as CustomEvent<{ trackId?: string; liked?: boolean }>).detail;
      const trackId = detail?.trackId;
      const liked = detail?.liked;

      if (!trackId || typeof liked !== "boolean") return;

      const wasLiked = likedTrackIdsRef.current.includes(trackId);
      if (wasLiked === liked) return;

      setLikedTrackIds((prev) =>
        liked
          ? (prev.includes(trackId) ? prev : [...prev, trackId])
          : prev.filter((id) => id !== trackId)
      );
      setLikesMonthByTrackId((prev) => ({
        ...prev,
        [trackId]: Math.max(0, (prev[trackId] ?? 0) + (liked ? 1 : -1)),
      }));
      setLikesAllTimeByTrackId((prev) => ({
        ...prev,
        [trackId]: Math.max(0, (prev[trackId] ?? 0) + (liked ? 1 : -1)),
      }));
    }

    window.addEventListener("soundiox:track-like-changed", handleTrackLikeChanged);
    return () => {
      window.removeEventListener("soundiox:track-like-changed", handleTrackLikeChanged);
    };
  }, []);

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
    try {
      const list = await fetchUserPlaylists(userId);
      setPlaylists(list);
      setSelectedPlaylistId((prev) => {
        if (prev && list.some((p) => p.id === prev)) return prev;
        return list[0]?.id ?? "";
      });
    } catch (error) {
      console.warn("discover playlists warning:", error);
      setPlaylists([]);
      setSelectedPlaylistId("");
    }
  }

  useEffect(() => {
    if (!viewerUserId) {
      setPlaylists([]);
      setSelectedPlaylistId("");
      setSelectedPlaylistTrackIds([]);
      setPlaylistTrackCountsByPlaylistId({});
      return;
    }

    void fetchPlaylists(viewerUserId);
  }, [viewerUserId]);

  useEffect(() => {
    let alive = true;

    async function loadPlaylistTrackCounts() {
      if (!playlists.length) {
        setPlaylistTrackCountsByPlaylistId({});
        return;
      }

      const playlistIds = playlists.map((playlist) => playlist.id).filter(Boolean);

      try {
        const { data, error } = await supabase
          .from("playlist_tracks")
          .select("playlist_id")
          .in("playlist_id", playlistIds);

        if (error) throw error;
        if (!alive) return;

        const nextCounts: Record<string, number> = {};

        for (const row of (data ?? []) as Array<{ playlist_id: string | null }>) {
          const playlistId = row.playlist_id ?? "";
          if (!playlistId) continue;
          nextCounts[playlistId] = (nextCounts[playlistId] ?? 0) + 1;
        }

        setPlaylistTrackCountsByPlaylistId(nextCounts);
      } catch (error) {
        console.warn("discover playlist counts warning:", error);
        if (!alive) return;
        setPlaylistTrackCountsByPlaylistId({});
      }
    }

    void loadPlaylistTrackCounts();

    return () => {
      alive = false;
    };
  }, [playlists]);

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

  const genreOptions = useMemo(() => ["All genres", ...SOUNDIOX_GENRES], []);

  const displayedTracks = useMemo(() => {
    const q = search.trim().toLowerCase();
    const selectedTrackIdSet = selectedPlaylistId
      ? new Set(selectedPlaylistTrackIds)
      : null;

    const filtered = tracks.filter((t) => {
      if (selectedTrackIdSet && !selectedTrackIdSet.has(t.id)) {
        return false;
      }

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
  }, [tracks, search, genre, selectedPlaylistId, selectedPlaylistTrackIds]);

  useEffect(() => {
    setPage(1);
  }, [search, genre, selectedPlaylistId]);

  const totalTracks = displayedTracks.length;
  const totalPages = Math.max(1, Math.ceil(totalTracks / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, totalTracks);
  const visibleTracks = displayedTracks.slice(startIndex, endIndex);
  const currentMonthWinnerTrackId = useMemo(() => {
    let topTrackId: string | null = null;
    let topLikes = 0;

    for (const track of tracks) {
      const likes = likesMonthByTrackId[track.id] ?? 0;
      if (likes > topLikes) {
        topTrackId = track.id;
        topLikes = likes;
      }
    }

    return topLikes > 0 ? topTrackId : null;
  }, [tracks, likesMonthByTrackId]);

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

    if (data?.id) {
      setPlaylists((prev) => [
        data as Playlist,
        ...prev.filter((playlist) => playlist.id !== data.id),
      ]);
      setSelectedPlaylistId(data.id);
    }

    await fetchPlaylists(viewerUserId);

    showToast("Playlist created ✓");
  }

  async function addTrackToSelectedPlaylist(track: DiscoverTrack) {
    if (!viewerUserId) {
      showToast("Please log in first");
      return;
    }

    if (!selectedPlaylistId) {
      showToast("Choose a playlist in My Playlists first");
      return;
    }

    try {
      await addTrackToPlaylistEntry(selectedPlaylistId, track.id);
    } catch {
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

    const alreadyLiked = likedTrackIds.includes(trackId);

    if (!alreadyLiked && likesRemaining <= 0) {
      showToast("You've used all monthly likes.");
      return;
    }

    try {
      setLikeLoadingTrackId(trackId);

      if (alreadyLiked) {
        await unlikeTrack(viewerUserId, trackId);

        likedTrackIdsRef.current = likedTrackIdsRef.current.filter((id) => id !== trackId);
        setLikedTrackIds((prev) => prev.filter((id) => id !== trackId));
        setLikesMonthByTrackId((prev) => ({
          ...prev,
          [trackId]: Math.max(0, (prev[trackId] ?? 0) - 1),
        }));
        setLikesAllTimeByTrackId((prev) => ({
          ...prev,
          [trackId]: Math.max(0, (prev[trackId] ?? 0) - 1),
        }));
        broadcastTrackLikeChanged(trackId, false);
        return;
      }

      await likeTrack(viewerUserId, trackId);

      likedTrackIdsRef.current = likedTrackIdsRef.current.includes(trackId)
        ? likedTrackIdsRef.current
        : [...likedTrackIdsRef.current, trackId];
      setLikedTrackIds((prev) => (prev.includes(trackId) ? prev : [...prev, trackId]));
      setLikesMonthByTrackId((prev) => ({
        ...prev,
        [trackId]: (prev[trackId] ?? 0) + 1,
      }));
      setLikesAllTimeByTrackId((prev) => ({
        ...prev,
        [trackId]: (prev[trackId] ?? 0) + 1,
      }));
      broadcastTrackLikeChanged(trackId, true);
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
          Free account active. Playlists are enabled. Upgrade to Premium with a 7 day free trial at {formatEuroPrice(
            SOUNDIOX_PRICING.premium
          )} or become an Artist at {formatEuroPrice(SOUNDIOX_PRICING.artist)} to upload music.
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

      {!viewerHasPaidPlan ? (
        <div className="mb-4 block rounded-2xl bg-white/8 p-4 ring-1 ring-white/10 lg:hidden">
          <div className="mb-3">
            <div className="text-base font-semibold text-white">Unlock more on SoundioX</div>
            <div className="text-sm text-white/60">
              Start Premium with a 7 day free trial or upgrade to Artist without scrolling through the full track list.
            </div>
          </div>

          <UpgradeButtons
            onUpgradePlan={handleUpgradePlan}
            viewerHasPaidPlan={viewerHasPaidPlan}
          />
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
        <div className="flex w-full flex-col gap-3 lg:w-auto lg:flex-row lg:items-center">
          <CustomSelect
            value={genre}
            onChange={setGenre}
            options={customGenreOptions}
            className="w-full lg:w-[220px]"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-2xl bg-white/6 p-3 ring-1 ring-white/10">
          <div className="mb-2 flex items-center justify-between px-2">
            <div className="font-semibold text-white/90">Discover</div>
            <div className="text-sm text-white/50">
              {loading
                ? "Loading..."
                : totalTracks === 0
                ? "0 tracks"
                : `${startIndex + 1}-${endIndex} of ${totalTracks} tracks`}
            </div>
          </div>

          <div className="mb-3 flex flex-col gap-3 rounded-2xl bg-white/8 px-4 py-3 ring-1 ring-white/10 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-white/75">
              {totalTracks === 0
                ? "Showing 0 tracks"
                : `Showing ${startIndex + 1}-${endIndex} of ${totalTracks} tracks`}
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

          <div className="space-y-2">
            {loading ? (
              <div className="px-2 py-6 text-white/60">Loading tracks…</div>
            ) : visibleTracks.length === 0 ? (
              <div className="px-2 py-6 text-white/60">No tracks found.</div>
            ) : (
              visibleTracks.map((t) => (
                <TrackCard
                  key={t.id}
                  track={t as any}
                  allTracks={displayedTracks as any}
                  onPlay={() => {
                    void playTrack(t as any, displayedTracks as any);
                  }}
                  onAdd={() => void addTrackToSelectedPlaylist(t)}
                  onLike={() => void toggleLike(t.id)}
                  onFollow={() => void toggleArtistFollow(t.user_id ?? "")}
                  allTimeLikeCount={likesAllTimeByTrackId[t.id] ?? 0}
                  monthLikeCount={likesMonthByTrackId[t.id] ?? 0}
                  isLiked={likedTrackIds.includes(t.id)}
                  likeLoading={likeLoadingTrackId === t.id}
                  canLike={viewerCanLike}
                  artistIsFounding={Boolean(t.artistIsFounding)}
                  isCurrentMonthWinner={currentMonthWinnerTrackId === t.id}
                  isPreviousMonthWinner={previousMonthWinnerTrackId === t.id}
                  artistId={t.user_id}
                  trackHref={`/track/${t.id}`}
                  artistHref={
                    t.artistSlug
                      ? `/artists/${encodeURIComponent(t.artistSlug)}`
                      : t.user_id
                        ? `/artists/${encodeURIComponent(t.user_id)}`
                        : null
                  }
                  showFollowButton={Boolean(t.user_id && t.user_id !== viewerUserId)}
                  isFollowing={Boolean(t.user_id && followingArtistIds.has(t.user_id))}
                  followLoading={followLoadingArtistId === t.user_id}
                />
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl bg-white/8 p-4 ring-1 ring-white/10">
            <div className="mb-1 text-lg font-semibold text-white">My Playlists</div>
            <div className="text-sm text-white/60">
              {selectedPlaylist
                ? `Showing tracks from ${selectedPlaylist.name}.`
                : "Open a playlist to focus the Discover feed on your saved tracks."}
            </div>

            {!viewerLoggedIn ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold text-white">Log in to see your playlists</div>
                <div className="mt-1 text-sm text-white/60">
                  Your saved playlists live here, and opening one filters Discover to that list.
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  className="mt-3 cursor-pointer rounded-xl bg-gradient-to-r from-cyan-400 to-sky-400 px-4 py-2 text-sm font-semibold text-white ring-1 ring-cyan-200/30 transition hover:opacity-95"
                >
                  Log in
                </button>
              </div>
            ) : (
              <>
                <div className="mt-4 space-y-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPlaylistId("")}
                    className={`flex w-full cursor-pointer items-center justify-between rounded-2xl px-3 py-3 text-left text-sm font-semibold transition ${
                      selectedPlaylistId
                        ? "bg-white/6 text-white/80 ring-1 ring-white/10 hover:bg-white/10"
                        : "bg-gradient-to-r from-cyan-300/35 via-sky-300/32 to-cyan-400/28 text-cyan-50 ring-1 ring-cyan-200/55 shadow-[0_0_24px_rgba(103,232,249,0.22)]"
                    }`}
                  >
                    <span>All tracks</span>
                    <span className="text-xs text-white/55">{tracks.length}</span>
                  </button>

                  {playlists.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/65">
                      You do not have any playlists yet. Create one here, then use Add on Discover
                      tracks to build your first collection.
                    </div>
                  ) : (
                    playlists.map((playlist) => {
                      const isActive = playlist.id === selectedPlaylistId;
                      const trackCount = playlistTrackCountsByPlaylistId[playlist.id] ?? 0;

                      return (
                        <button
                          key={playlist.id}
                          type="button"
                          onClick={() => setSelectedPlaylistId(playlist.id)}
                          className={`flex w-full cursor-pointer items-center justify-between rounded-2xl px-3 py-3 text-left transition ${
                            isActive
                              ? "bg-gradient-to-r from-cyan-300/35 via-sky-300/32 to-cyan-400/28 text-cyan-50 ring-1 ring-cyan-200/55 shadow-[0_0_24px_rgba(103,232,249,0.22)]"
                              : "bg-white/6 text-white/85 ring-1 ring-white/10 hover:bg-white/10"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{playlist.name}</div>
                            <div className="text-xs text-white/55">
                              {trackCount} track{trackCount === 1 ? "" : "s"}
                            </div>
                          </div>
                          <span className="text-[11px] font-semibold text-white/55">
                            {isActive ? "OPEN" : "View"}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="mb-2 text-xs font-bold tracking-widest text-white/55">
                    CREATE PLAYLIST
                  </div>
                  <div className="flex flex-col gap-2">
                    <input
                      value={newPlaylistName}
                      onChange={(e) => setNewPlaylistName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        void createPlaylist();
                      }}
                      placeholder="New playlist..."
                      className="h-10 rounded-xl bg-white/10 px-3 text-sm font-medium text-white placeholder:text-white/50 outline-none ring-1 ring-white/10"
                    />
                    <button
                      type="button"
                      onClick={createPlaylist}
                      className="h-10 cursor-pointer rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-500 px-4 text-sm font-bold text-white ring-1 ring-white/15"
                    >
                      Create
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {!viewerHasPaidPlan ? (
            <div className="rounded-2xl bg-white/8 p-4 ring-1 ring-white/10">
              <div className="mb-3">
                <div className="text-base font-semibold text-white">Unlock more on SoundioX</div>
                <div className="text-sm text-white/60">
                  Start Premium with a 7 day free trial or upgrade to Artist for uploads and more engagement tools.
                </div>
              </div>

              <UpgradeButtons
                onUpgradePlan={handleUpgradePlan}
                viewerHasPaidPlan={viewerHasPaidPlan}
              />

              {upgradeLoading ? (
                <div className="mt-3 text-center text-xs text-white/50">
                  Opening checkout...
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
