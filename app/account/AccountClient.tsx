"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import TrackCard from "@/app/components/TrackCard";
import { usePlayer } from "@/app/components/PlayerContext";
import {
  normalizeAccessPlan,
  shouldGrantLifetimeCampaignPlan,
} from "@/lib/lifetimeCampaign";
import { isSoundioXGenre } from "@/lib/genres";

type ProfileRow = {
  id: string;
  email?: string | null;
  role: string | null;
  display_name: string | null;
  bio: string | null;
  country: string | null;
  avatar_url: string | null;
  slug: string | null;
  plan: string | null;
  is_founding: boolean | null;
  created_at?: string | null;
};

type FollowRow = {
  following_profile_id: string;
  created_at: string | null;
};

type FollowingProfileRow = {
  id: string;
  display_name: string | null;
  slug: string | null;
  avatar_url: string | null;
};

type PlaylistRow = {
  id: string;
  name: string;
  created_at: string | null;
  user_id: string;
};

type PlaylistTrackRow = {
  playlist_id: string;
  track_id: string;
};

type LikeRow = {
  track_id: string;
};

type TrackRow = {
  id: string;
  title: string | null;
  artist: string | null;
  genre: string | null;
  artwork_url: string | null;
  audio_url: string | null;
  created_at: string | null;
  plays_all_time?: number | null;
  plays_this_month?: number | null;
  user_id?: string | null;
};

const ARTIST_CAMPAIGN_DEADLINE_ISO = "2026-03-23T23:59:59Z";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function getAvatarUrl(value: string | null | undefined) {
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("/")) return value;
  return value;
}

function extractStoragePathFromPublicUrl(url: string | null) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const marker = "/storage/v1/object/public/tracks/";
    const idx = parsed.pathname.indexOf(marker);

    if (idx === -1) return null;

    const rawPath = parsed.pathname.slice(idx + marker.length);
    if (!rawPath) return null;

    return decodeURIComponent(rawPath);
  } catch {
    return null;
  }
}

function getCookieValue(name: string) {
  if (typeof document === "undefined") return null;

  const cookies = document.cookie ? document.cookie.split("; ") : [];

  for (const cookie of cookies) {
    const [key, ...rest] = cookie.split("=");
    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return null;
}

function setInviteCookie(token: string) {
  if (typeof document === "undefined") return;
  document.cookie = `soundiox_invite_token=${encodeURIComponent(
    token
  )}; path=/; max-age=3600; samesite=lax`;
}

function deleteInviteCookie() {
  if (typeof document === "undefined") return;
  document.cookie =
    "soundiox_invite_token=; path=/; max-age=0; samesite=lax";
}

function normalizeProfileRole(value: string | null | undefined) {
  if (value === "artist") return "artist";
  return "listener";
}

function isArtistCampaignActive() {
  return Date.now() <= new Date(ARTIST_CAMPAIGN_DEADLINE_ISO).getTime();
}

function getOfficialGenreLabel(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  return isSoundioXGenre(raw) ? raw : "";
}

export default function AccountClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { playTrack } = usePlayer();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inviteHandledRef = useRef(false);

  const selectedPlan = searchParams.get("plan");
  const checkoutStatus = searchParams.get("checkout");
  const welcome = searchParams.get("welcome");
  const inviteToken = searchParams.get("invite");

  const hasFoundingInvite = welcome === "founding";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [claimingInvite, setClaimingInvite] = useState(false);
  const [claimingArtistCampaign, setClaimingArtistCampaign] = useState(false);

  const [userId, setUserId] = useState<string>("");
  const [email, setEmail] = useState<string>("");

  const [role, setRole] = useState<"listener" | "artist">("listener");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [country, setCountry] = useState("");
  const [slug, setSlug] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [plan, setPlan] = useState<"free" | "premium" | "artist" | "lifetime">(
    "free"
  );
  const [isFounding, setIsFounding] = useState(false);

  const [followingCount, setFollowingCount] = useState(0);
  const [followingProfiles, setFollowingProfiles] = useState<
    FollowingProfileRow[]
  >([]);
  const [loadingFollowing, setLoadingFollowing] = useState(false);

  const [playlists, setPlaylists] = useState<PlaylistRow[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>("");
  const [selectedPlaylistTracks, setSelectedPlaylistTracks] = useState<
    TrackRow[]
  >([]);
  const [loadingSelectedPlaylistTracks, setLoadingSelectedPlaylistTracks] =
    useState(false);

  const [likedTracks, setLikedTracks] = useState<TrackRow[]>([]);
  const [loadingLikedTracks, setLoadingLikedTracks] = useState(false);
  const [myTracks, setMyTracks] = useState<TrackRow[]>([]);
  const [loadingMyTracks, setLoadingMyTracks] = useState(false);
  const [editingTrackId, setEditingTrackId] = useState<string>("");
  const [editTitle, setEditTitle] = useState("");
  const [savingTrackId, setSavingTrackId] = useState<string>("");
  const [deletingTrackId, setDeletingTrackId] = useState<string>("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const profileUrl = useMemo(() => {
    if (!slug) return "";
    return `/artists/${slug}`;
  }, [slug]);

  const selectedPlaylist = useMemo(() => {
    return (
      playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? null
    );
  }, [playlists, selectedPlaylistId]);

  const artistCampaignActive = isArtistCampaignActive();
  const isArtistAccount = isFounding || role === "artist" || plan === "artist";
  const canUpload = isArtistAccount;
  const canCreatePlaylists = Boolean(userId);
  const canLikeTracks =
    isFounding ||
    role === "artist" ||
    plan === "premium" ||
    plan === "artist" ||
    plan === "lifetime";

  const showArtistCampaignCta =
    !isFounding && !canUpload && artistCampaignActive;

  async function loadProfile(user: any, options?: { skipCreate?: boolean }) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "id, email, role, display_name, bio, country, avatar_url, slug, plan, is_founding, created_at"
      )
      .eq("id", user.id)
      .maybeSingle<ProfileRow>();

    if (profileError) {
      throw profileError;
    }

    const defaultDisplayName = "AI Artist";
    const defaultSlug = `artist-${String(user.id || "").slice(0, 8)}`;

    const nextDisplayName = profile?.display_name || defaultDisplayName;
    const nextSlug = profile?.slug || defaultSlug;
    const nextRole = normalizeProfileRole(profile?.role);
    const nextPlan = normalizeAccessPlan(profile?.plan);
    const nextFounding = Boolean(profile?.is_founding);
    const shouldGrantLifetime = shouldGrantLifetimeCampaignPlan({
      plan: profile?.plan,
      isFounding: nextFounding,
    });
    const effectivePlan = shouldGrantLifetime ? "lifetime" : nextPlan;

    setRole(nextRole);
    setDisplayName(nextDisplayName);
    setBio(profile?.bio || "");
    setCountry(profile?.country || "");
    setSlug(nextSlug);
    setAvatarUrl(profile?.avatar_url || "");
    setPlan(effectivePlan);
    setIsFounding(nextFounding);

    if (profile && shouldGrantLifetime) {
      const { error: upgradeError } = await supabase
        .from("profiles")
        .update({ plan: "lifetime" })
        .eq("id", user.id);

      if (upgradeError) {
        console.warn("lifetime campaign profile update warning:", upgradeError);
      }
    }

    if (!profile && !options?.skipCreate) {
      const defaultPlan = shouldGrantLifetimeCampaignPlan({
        plan: null,
        isFounding: false,
      })
        ? "lifetime"
        : "free";

      const insertPayload = {
        id: user.id,
        email: user.email ?? null,
        role: "listener",
        display_name: nextDisplayName,
        bio: null,
        country: null,
        avatar_url: null,
        slug: nextSlug,
        plan: defaultPlan,
        is_founding: false,
      };

      const { error: insertError } = await supabase
        .from("profiles")
        .upsert(insertPayload, { onConflict: "id" });

      if (insertError) {
        throw insertError;
      }

      setRole("listener");
      setDisplayName(nextDisplayName);
      setBio("");
      setCountry("");
      setSlug(nextSlug);
      setAvatarUrl("");
      setPlan(defaultPlan);
      setIsFounding(false);
    }
  }

  async function loadFollowing(userProfileId: string) {
    setLoadingFollowing(true);

    try {
      const { data: followRows, error: followsError } = await supabase
        .from("follows")
        .select("following_profile_id, created_at")
        .eq("follower_id", userProfileId)
        .order("created_at", { ascending: false });

      if (followsError) {
        throw followsError;
      }

      const rows = (followRows ?? []) as FollowRow[];
      setFollowingCount(rows.length);

      const followedIds = rows
        .map((row) => row.following_profile_id)
        .filter(
          (value): value is string =>
            typeof value === "string" && value.length > 0
        );

      if (!followedIds.length) {
        setFollowingProfiles([]);
        return;
      }

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, display_name, slug, avatar_url")
        .in("id", followedIds);

      if (profilesError) {
        throw profilesError;
      }

      const profileMap = new Map(
        ((profiles ?? []) as FollowingProfileRow[]).map((profile) => [
          profile.id,
          profile,
        ])
      );

      const orderedProfiles = followedIds
        .map((id) => profileMap.get(id))
        .filter(
          (profile): profile is FollowingProfileRow => Boolean(profile)
        );

      setFollowingProfiles(orderedProfiles);
    } catch (err) {
      console.error("following load error:", err);
      setFollowingCount(0);
      setFollowingProfiles([]);
    } finally {
      setLoadingFollowing(false);
    }
  }

  async function loadPlaylists(ownerId: string) {
    setLoadingPlaylists(true);

    try {
      const { data, error } = await supabase
        .from("playlists")
        .select("id,name,created_at,user_id")
        .eq("user_id", ownerId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as PlaylistRow[];
      setPlaylists(rows);

      setSelectedPlaylistId((prev) => {
        if (prev && rows.some((playlist) => playlist.id === prev)) return prev;
        return rows[0]?.id ?? "";
      });
    } catch (err) {
      console.error("playlists load error:", err);
      setPlaylists([]);
      setSelectedPlaylistId("");
    } finally {
      setLoadingPlaylists(false);
    }
  }

  async function loadLikedTracks(ownerId: string) {
    setLoadingLikedTracks(true);

    try {
      const { data: likeRows, error: likesError } = await supabase
        .from("likes")
        .select("track_id")
        .eq("user_id", ownerId);

      if (likesError) throw likesError;

      const ids = ((likeRows ?? []) as LikeRow[])
        .map((row) => row.track_id)
        .filter(
          (id): id is string => typeof id === "string" && id.length > 0
        );

      if (!ids.length) {
        setLikedTracks([]);
        return;
      }

      const { data: tracks, error: tracksError } = await supabase
        .from("tracks")
        .select(
          "id,title,artist,genre,artwork_url,audio_url,created_at,plays_all_time,plays_this_month,user_id"
        )
        .in("id", ids);

      if (tracksError) throw tracksError;

      const trackMap = new Map(
        ((tracks ?? []) as TrackRow[]).map((track) => [track.id, track])
      );

      const orderedTracks = ids
        .map((id) => trackMap.get(id))
        .filter((track): track is TrackRow => Boolean(track));

      setLikedTracks(orderedTracks);
    } catch (err) {
      console.error("liked tracks load error:", err);
      setLikedTracks([]);
    } finally {
      setLoadingLikedTracks(false);
    }
  }

  async function loadSelectedPlaylistTracks(playlistId: string) {
    if (!playlistId) {
      setSelectedPlaylistTracks([]);
      return;
    }

    setLoadingSelectedPlaylistTracks(true);

    try {
      const { data: playlistTrackRows, error: playlistTracksError } =
        await supabase
          .from("playlist_tracks")
          .select("playlist_id, track_id")
          .eq("playlist_id", playlistId);

      if (playlistTracksError) throw playlistTracksError;

      const ids = ((playlistTrackRows ?? []) as PlaylistTrackRow[])
        .map((row) => row.track_id)
        .filter(
          (id): id is string => typeof id === "string" && id.length > 0
        );

      if (!ids.length) {
        setSelectedPlaylistTracks([]);
        return;
      }

      const { data: tracks, error: tracksError } = await supabase
        .from("tracks")
        .select(
          "id,title,artist,genre,artwork_url,audio_url,created_at,plays_all_time,plays_this_month,user_id"
        )
        .in("id", ids);

      if (tracksError) throw tracksError;

      const trackMap = new Map(
        ((tracks ?? []) as TrackRow[]).map((track) => [track.id, track])
      );

      const orderedTracks = ids
        .map((id) => trackMap.get(id))
        .filter((track): track is TrackRow => Boolean(track));

      setSelectedPlaylistTracks(orderedTracks);
    } catch (err) {
      console.error("selected playlist tracks load error:", err);
      setSelectedPlaylistTracks([]);
    } finally {
      setLoadingSelectedPlaylistTracks(false);
    }
  }

  async function loadMyTracks(ownerId: string) {
    setLoadingMyTracks(true);

    try {
      const { data, error } = await supabase
        .from("tracks")
        .select(
          "id,title,artist,genre,artwork_url,audio_url,created_at,plays_all_time,plays_this_month,user_id"
        )
        .eq("user_id", ownerId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setMyTracks((data ?? []) as TrackRow[]);
    } catch (err) {
      console.error("my tracks load error:", err);
      setMyTracks([]);
    } finally {
      setLoadingMyTracks(false);
    }
  }

  function startEditingTrack(track: TrackRow) {
    setEditingTrackId(track.id);
    setEditTitle(track.title || "");
  }

  function cancelEditingTrack() {
    setEditingTrackId("");
    setEditTitle("");
  }

  async function saveTrackTitle(trackId: string) {
    if (!userId) return;

    const nextTitle = editTitle.trim();

    if (!nextTitle) {
      setError("Track title cannot be empty.");
      return;
    }

    setSavingTrackId(trackId);
    setError("");
    setMessage("");

    try {
      const { error } = await supabase
        .from("tracks")
        .update({ title: nextTitle })
        .eq("id", trackId)
        .eq("user_id", userId);

      if (error) throw error;

      setMyTracks((prev) =>
        prev.map((track) =>
          track.id === trackId ? { ...track, title: nextTitle } : track
        )
      );
      setEditingTrackId("");
      setEditTitle("");
      setMessage("Track title updated.");
    } catch (err: any) {
      setError(err?.message || "Track update failed.");
    } finally {
      setSavingTrackId("");
    }
  }

  async function deleteTrack(track: TrackRow) {
    if (!userId) return;

    const confirmed = window.confirm(
      `Delete "${track.title || "Untitled"}"? This cannot be undone.`
    );

    if (!confirmed) return;

    setDeletingTrackId(track.id);
    setError("");
    setMessage("");

    try {
      const { error } = await supabase
        .from("tracks")
        .delete()
        .eq("id", track.id)
        .eq("user_id", userId);

      if (error) throw error;

      const storagePaths = [
        extractStoragePathFromPublicUrl(track.audio_url || null),
        extractStoragePathFromPublicUrl(track.artwork_url || null),
      ].filter((value, index, array): value is string => {
        return Boolean(value) && array.indexOf(value) === index;
      });

      if (storagePaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from("tracks")
          .remove(storagePaths);

        if (storageError) {
          console.warn("track storage cleanup warning:", storageError);
        }
      }

      setMyTracks((prev) => prev.filter((item) => item.id !== track.id));

      if (editingTrackId === track.id) {
        cancelEditingTrack();
      }

      setMessage("Track deleted.");
    } catch (err: any) {
      setError(err?.message || "Track deletion failed.");
    } finally {
      setDeletingTrackId("");
    }
  }

  useEffect(() => {
    let mounted = true;

    async function loadAccount() {
      setLoading(true);
      setError("");
      setMessage("");

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;

        if (!user) {
          router.replace("/login");
          return;
        }

        if (!mounted) return;

        setUserId(user.id);
        setEmail(user.email ?? "");

        await loadProfile(user, { skipCreate: hasFoundingInvite });
        await Promise.all([
          loadFollowing(user.id),
          loadPlaylists(user.id),
          loadLikedTracks(user.id),
          loadMyTracks(user.id),
        ]);
      } catch (err: any) {
        setError(err?.message || "Account page failed to load.");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadAccount();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        router.replace("/login");
        return;
      }

      setUserId(session.user.id);
      setEmail(session.user.email ?? "");
      void Promise.all([
        loadFollowing(session.user.id),
        loadPlaylists(session.user.id),
        loadLikedTracks(session.user.id),
        loadMyTracks(session.user.id),
      ]);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router, hasFoundingInvite]);

  useEffect(() => {
    if (!selectedPlan || checkoutStatus === "success") return;

    if (selectedPlan === "premium") {
      setMessage("Premium plan selected. Complete checkout to activate it.");
    }

    if (selectedPlan === "artist") {
      setMessage("Artist plan selected. Complete checkout to activate it.");
    }
  }, [selectedPlan, checkoutStatus]);

  useEffect(() => {
    if (!checkoutStatus) return;

    if (checkoutStatus === "success") {
      setMessage("Checkout completed. Activating your plan...");
      setError("");
    }

    if (checkoutStatus === "cancel") {
      setError("Checkout was cancelled.");
    }
  }, [checkoutStatus]);

  useEffect(() => {
    let cancelled = false;

    async function refreshProfileAfterCheckout() {
      if (checkoutStatus !== "success") return;

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        return;
      }

      for (let attempt = 0; attempt < 6; attempt++) {
        if (cancelled) return;

        try {
          await loadProfile(user);

          if (cancelled) return;

          if (attempt < 5) {
            const { data: profileRow, error: profileError } = await supabase
              .from("profiles")
              .select("role, plan, is_founding")
              .eq("id", user.id)
              .maybeSingle<{
                role: string | null;
                plan: string | null;
                is_founding: boolean | null;
              }>();

            if (profileError) {
              throw profileError;
            }

            const refreshedRole = normalizeProfileRole(profileRow?.role);
            const refreshedPlan = normalizeAccessPlan(profileRow?.plan);
            const refreshedFounding = Boolean(profileRow?.is_founding);

            if (
              refreshedFounding ||
              refreshedRole === "artist" ||
              refreshedPlan !== "free"
            ) {
              setMessage("Your access is active.");
              router.replace("/account");
              return;
            }
          }
        } catch (err: any) {
          console.error("checkout profile refresh error:", err?.message || err);
        }

        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }
    }

    void refreshProfileAfterCheckout();

    return () => {
      cancelled = true;
    };
  }, [checkoutStatus, router]);

  useEffect(() => {
    let mounted = true;

    async function claimFoundingInvite() {
      if (!hasFoundingInvite) return;
      if (inviteHandledRef.current) return;

      const pendingInviteToken = (
        inviteToken ||
        getCookieValue("soundiox_invite_token") ||
        ""
      ).trim();

      if (!pendingInviteToken) return;

      inviteHandledRef.current = true;
      setClaimingInvite(true);
      setError("");

      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (!session?.user || !session.access_token) {
          throw new Error("Please log in first.");
        }

        setInviteCookie(pendingInviteToken);

        const res = await fetch("/api/founding/claim", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ inviteToken: pendingInviteToken }),
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(data?.error || "Founding invite claim failed.");
        }

        if (!mounted) return;

        deleteInviteCookie();
        await loadProfile(session.user);
        await Promise.all([
          loadFollowing(session.user.id),
          loadPlaylists(session.user.id),
          loadLikedTracks(session.user.id),
          loadMyTracks(session.user.id),
        ]);
        setMessage("Welcome, Founding Artist.");
        router.replace("/account?welcome=founding");
      } catch (err: any) {
        if (!mounted) return;
        inviteHandledRef.current = false;
        setError(err?.message || "Founding invite claim failed.");
      } finally {
        if (mounted) {
          setClaimingInvite(false);
        }
      }
    }

    void claimFoundingInvite();

    return () => {
      mounted = false;
    };
  }, [hasFoundingInvite, inviteToken, router]);

  useEffect(() => {
    void loadSelectedPlaylistTracks(selectedPlaylistId);
  }, [selectedPlaylistId]);

  async function handleSave() {
    if (!userId) return;

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const cleanDisplayName = displayName.trim();
      const cleanBio = bio.trim();
      const cleanCountry = country.trim();
      const cleanSlug = slugify(slug || displayName || "artist");

      if (!cleanDisplayName) {
        throw new Error("Display name is required.");
      }

      const { data: existingSlug, error: slugError } = await supabase
        .from("profiles")
        .select("id")
        .eq("slug", cleanSlug)
        .neq("id", userId)
        .maybeSingle();

      if (slugError) throw slugError;

      if (existingSlug) {
        throw new Error("That profile URL is already taken.");
      }

      const payload = {
        id: userId,
        email: email || null,
        display_name: cleanDisplayName,
        bio: cleanBio || null,
        country: cleanCountry || null,
        avatar_url: avatarUrl || null,
        slug: cleanSlug || null,
      };

      const { error: saveError } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" });

      if (saveError) throw saveError;

      setSlug(cleanSlug);
      setMessage("Profile saved.");
    } catch (err: any) {
      setError(err?.message || "Saving failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarChange(file: File | null) {
    if (!file || !userId) return;

    setUploadingAvatar(true);
    setMessage("");
    setError("");

    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${userId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = data?.publicUrl || "";

      if (!publicUrl) {
        throw new Error("Could not create avatar URL.");
      }

      setAvatarUrl(publicUrl);

      const { error: updateError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: userId,
            avatar_url: publicUrl,
          },
          { onConflict: "id" }
        );

      if (updateError) throw updateError;

      setMessage("Avatar uploaded.");
    } catch (err: any) {
      setError(err?.message || "Avatar upload failed.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleClaimArtistCampaign() {
    if (!userId) return;

    setClaimingArtistCampaign(true);
    setMessage("");
    setError("");

    try {
      if (!artistCampaignActive) {
        throw new Error("This free artist campaign has ended.");
      }

      const nextSlug = slugify(slug || displayName || "artist");
      const nextDisplayName = (displayName || "AI Artist").trim() || "AI Artist";

      const payload = {
        id: userId,
        email: email || null,
        role: "artist",
        display_name: nextDisplayName,
        bio: bio.trim() || null,
        country: country.trim() || null,
        avatar_url: avatarUrl || null,
        slug: nextSlug || null,
        plan: "lifetime",
      };

      const { error: updateError } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" });

      if (updateError) throw updateError;

      setRole("artist");
      setPlan("lifetime");
      setSlug(nextSlug);
      setDisplayName(nextDisplayName);
      setMessage("Artist access activated for free forever.");
    } catch (err: any) {
      setError(err?.message || "Campaign activation failed.");
    } finally {
      setClaimingArtistCampaign(false);
    }
  }

  async function handleLogout() {
    setError("");
    setMessage("");

    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#07090f] px-6 py-10 text-white">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
            <p className="text-sm text-white/70">Loading account...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07090f] px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.16),transparent_35%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.16),transparent_35%),rgba(255,255,255,0.04)] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative h-20 w-20 overflow-hidden rounded-2xl border border-white/15 bg-white/10">
                {avatarUrl ? (
                  <Image
                    src={getAvatarUrl(avatarUrl)}
                    alt="Avatar"
                    fill
                    className="object-cover"
                    sizes="80px"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-white/70">
                    {(displayName || "A").charAt(0).toUpperCase()}
                  </div>
                )}

                {isFounding ? (
                  <div className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-cyan-300/70" />
                ) : null}
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight">
                    {displayName || "Your account"}
                  </h1>

                  {isFounding ? (
                    <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
                      Founding Artist
                    </span>
                  ) : isArtistAccount ? (
                    <span className="rounded-full border border-fuchsia-300/30 bg-fuchsia-400/10 px-3 py-1 text-xs font-medium text-fuchsia-200">
                      Artist
                    </span>
                  ) : (
                    <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1 text-xs font-medium text-white/75">
                      Listener
                    </span>
                  )}
                </div>

                <p className="mt-1 text-sm text-white/65">{email}</p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm text-white transition hover:bg-white/12"
                  >
                    {uploadingAvatar ? "Uploading..." : "Upload avatar"}
                  </button>

                  {profileUrl ? (
                    <Link
                      href={profileUrl}
                      className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm text-white transition hover:bg-white/12"
                    >
                      View public profile
                    </Link>
                  ) : null}

                  {canUpload ? (
                    <Link
                      href="/upload"
                      className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100 transition hover:bg-cyan-400/15"
                    >
                      Upload track
                    </Link>
                  ) : showArtistCampaignCta ? (
                    <button
                      type="button"
                      onClick={handleClaimArtistCampaign}
                      disabled={claimingArtistCampaign}
                      className="rounded-full border border-rose-300/25 bg-gradient-to-r from-rose-600 via-red-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {claimingArtistCampaign
                        ? "Activating..."
                        : "Launch Campaign: Free Forever"}
                    </button>
                  ) : (
                    <Link
                      href="/discover"
                      className="rounded-full border border-fuchsia-300/20 bg-fuchsia-400/10 px-4 py-2 text-sm text-fuchsia-100 transition hover:bg-fuchsia-400/15"
                    >
                      Become Artist
                    </Link>
                  )}

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm text-white transition hover:bg-white/12"
                  >
                    Log out
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) =>
                    handleAvatarChange(e.target.files?.[0] || null)
                  }
                />
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/75">
              <div>
                <span className="text-white/45">Access:</span>{" "}
                <span className="font-medium text-white">
                  {isFounding
                    ? "Founding Artist"
                    : canUpload
                    ? "Artist"
                    : plan === "lifetime"
                    ? "Lifetime Listener"
                    : plan === "premium"
                    ? "Premium Listener"
                    : "Free Listener"}
                </span>
              </div>
              {!canUpload && artistCampaignActive ? (
                <div className="mt-1 text-xs text-rose-200/90">
                  Free artist campaign active until Monday.
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {claimingInvite ? (
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-200">
            Activating Founding Artist invite...
          </div>
        ) : null}

        {message ? (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        {!isFounding && !isArtistAccount ? (
          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[28px] border border-rose-300/15 bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.22),transparent_35%),radial-gradient(circle_at_top_right,rgba(249,115,22,0.18),transparent_35%),rgba(255,255,255,0.04)] p-6 backdrop-blur-xl">
              <h2 className="text-lg font-semibold text-white">
                Artist campaign
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/75">
                Join before Monday and unlock artist access for free forever.
              </p>

              <div className="mt-5">
                {showArtistCampaignCta ? (
                  <button
                    type="button"
                    onClick={handleClaimArtistCampaign}
                    disabled={claimingArtistCampaign}
                    className="inline-flex h-12 items-center justify-center rounded-full bg-gradient-to-r from-rose-600 via-red-500 to-orange-500 px-6 text-sm font-semibold text-white transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {claimingArtistCampaign
                      ? "Activating..."
                      : "Launch Campaign: Free Forever"}
                  </button>
                ) : (
                  <Link
                    href="/discover"
                    className="inline-flex h-12 items-center justify-center rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-6 text-sm font-medium text-white transition hover:scale-[1.01]"
                  >
                    Become Artist
                  </Link>
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
              <h2 className="text-lg font-semibold text-white">
                Premium listener
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/65">
                Premium unlocks monthly likes while keeping playlists available
                on your account.
              </p>

              <div className="mt-5">
                <Link
                  href="/discover"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-white/8 px-6 text-sm font-medium text-white transition hover:bg-white/12"
                >
                  Upgrade to Premium
                </Link>
              </div>
            </div>
          </section>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)] xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          <div className="min-w-0 space-y-6">
            <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
  <h2 className="text-lg font-semibold text-white">Profile settings</h2>
  <p className="mt-1 text-sm text-white/60">Edit your public profile.</p>

  <div className="mt-6 max-w-2xl space-y-5 xl:max-w-[42rem]">
    <div>
      <label className="mb-2 block text-sm text-white/75">Display name</label>
      <input
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder="AI Artist"
        className="h-12 w-full rounded-2xl border border-white/10 bg-white/6 px-4 text-white outline-none transition placeholder:text-white/30 focus:border-cyan-300/40"
      />
    </div>

    <div>
      <label className="mb-2 block text-sm text-white/75">Country</label>
      <input
        value={country}
        onChange={(e) => setCountry(e.target.value)}
        placeholder="Estonia"
        className="h-12 w-full rounded-2xl border border-white/10 bg-white/6 px-4 text-white outline-none transition placeholder:text-white/30 focus:border-cyan-300/40"
      />
    </div>

    <div>
      <label className="mb-2 block text-sm text-white/75">
        Public profile URL
      </label>
      <div className="flex items-center rounded-2xl border border-white/10 bg-white/6 px-4">
        <span className="mr-2 text-sm text-white/35">/artists/</span>
        <input
          value={slug}
          onChange={(e) => setSlug(slugify(e.target.value))}
          placeholder="ai-artist"
          className="h-12 w-full bg-transparent text-white outline-none placeholder:text-white/30"
        />
      </div>
    </div>

    <div>
      <label className="mb-2 block text-sm text-white/75">Bio</label>
      <textarea
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        placeholder="Tell listeners who you are..."
        rows={6}
        className="w-full rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-cyan-300/40"
      />
    </div>

    <button
      type="button"
      onClick={handleSave}
      disabled={saving}
      className="inline-flex h-12 items-center justify-center rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-6 text-sm font-medium text-white transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {saving ? "Saving..." : "Save profile"}
    </button>
  </div>
</section>

<section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
  <div className="mb-4 flex items-center justify-between gap-3">
    <div>
      <h2 className="text-lg font-semibold text-white">My Playlists</h2>
      <p className="mt-1 text-sm text-white/60">
        Open your saved playlists and play them from your account.
      </p>
    </div>

    <div className="text-sm font-medium text-white/55">{playlists.length} total</div>
  </div>

  {loadingPlaylists ? (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
      Loading playlists...
    </div>
  ) : playlists.length === 0 ? (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
      You do not have playlists yet. Create one on Discover.
    </div>
  ) : (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {playlists.map((playlist) => {
          const active = playlist.id === selectedPlaylistId;

          return (
            <button
              key={playlist.id}
              type="button"
              onClick={() => setSelectedPlaylistId(playlist.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                active
                  ? "bg-cyan-400 text-white"
                  : "border border-white/10 bg-white/8 text-white/80 hover:bg-white/12"
              }`}
            >
              {playlist.name}
            </button>
          );
        })}
      </div>

      <div className="mb-4 rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-sm text-white/45">Selected playlist</div>
        <div className="mt-1 text-base font-semibold text-white">
          {selectedPlaylist?.name || "—"}
        </div>
        <div className="mt-1 text-sm text-white/55">
          {selectedPlaylistTracks.length} track
          {selectedPlaylistTracks.length === 1 ? "" : "s"}
        </div>
      </div>

      {loadingSelectedPlaylistTracks ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
          Loading playlist tracks...
        </div>
      ) : selectedPlaylistTracks.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
          This playlist is empty.
        </div>
      ) : (
        <div className="space-y-2">
          {selectedPlaylistTracks.map((track) => (
            <TrackCard
              key={track.id}
              track={track as any}
              allTracks={selectedPlaylistTracks as any}
              onPlay={() => {
                void playTrack(track as any, selectedPlaylistTracks as any);
              }}
            />
          ))}
        </div>
      )}
    </>
  )}
</section>

<section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
  <div className="mb-4 flex items-center justify-between gap-3">
    <div>
      <h2 className="text-lg font-semibold text-white">My Likes</h2>
      <p className="mt-1 text-sm text-white/60">
        Tracks you have supported with likes.
      </p>
    </div>

    <div className="text-sm font-medium text-white/55">{likedTracks.length} total</div>
  </div>

  {loadingLikedTracks ? (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
      Loading liked tracks...
    </div>
  ) : likedTracks.length === 0 ? (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
      You have not liked any tracks yet.
    </div>
  ) : (
    <div className="space-y-2">
      {likedTracks.map((track) => (
        <TrackCard
          key={track.id}
          track={track as any}
          allTracks={likedTracks as any}
          onPlay={() => {
            void playTrack(track as any, likedTracks as any);
          }}
        />
      ))}
    </div>
  )}
</section>

<section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
  <div className="mb-4 flex items-center justify-between gap-3">
    <div>
      <h2 className="text-lg font-semibold text-white">My Tracks</h2>
      <p className="mt-1 text-sm text-white/60">
        Manage your uploaded tracks.
      </p>
    </div>

    <div className="text-sm font-medium text-white/55">{myTracks.length} total</div>
  </div>

  {loadingMyTracks ? (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
      Loading tracks...
    </div>
  ) : myTracks.length === 0 ? (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
      No tracks uploaded yet.
    </div>
  ) : (
    <div className="space-y-3">
      {myTracks.map((track) => {
        const isEditing = editingTrackId === track.id;
        const isSaving = savingTrackId === track.id;
        const isDeleting = deletingTrackId === track.id;
        const artworkSrc = getAvatarUrl(track.artwork_url) || "/logo-new.png";

        return (
          <div
            key={track.id}
            className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 md:flex-row md:items-center md:justify-between"
          >
            <div className="flex min-w-0 items-center gap-4">
              <div className="relative h-14 w-14 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                <Image
                  src={artworkSrc}
                  alt={track.title || "Track artwork"}
                  fill
                  className="object-cover"
                  sizes="56px"
                />
              </div>

              <div className="min-w-0">
                {isEditing ? (
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="h-11 w-full max-w-md rounded-2xl border border-white/10 bg-white/6 px-4 text-sm font-medium text-white outline-none transition placeholder:text-white/30 focus:border-cyan-300/40"
                    placeholder="Track title"
                  />
                ) : (
                  <div className="truncate text-base font-semibold text-white">
                    {track.title || "Untitled"}
                  </div>
                )}

                <div className="mt-1 truncate text-sm text-white/55">
                  {(track.artist || displayName || "AI Artist") + " • "}
                  {getOfficialGenreLabel(track.genre) || "No genre"}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/track/${track.id}`}
                className="inline-flex h-10 items-center justify-center rounded-full border border-white/15 bg-white/8 px-4 text-sm font-medium text-white transition hover:bg-white/12"
              >
                View
              </Link>

              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={() => saveTrackTitle(track.id)}
                    disabled={isSaving}
                    className="inline-flex h-10 items-center justify-center rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-4 text-sm font-medium text-white transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSaving ? "Saving..." : "Save"}
                  </button>

                  <button
                    type="button"
                    onClick={cancelEditingTrack}
                    disabled={isSaving}
                    className="inline-flex h-10 items-center justify-center rounded-full border border-white/15 bg-white/8 px-4 text-sm font-medium text-white transition hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => startEditingTrack(track)}
                  disabled={Boolean(editingTrackId) || isDeleting}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Edit
                </button>
              )}

              <button
                type="button"
                onClick={() => deleteTrack(track)}
                disabled={isDeleting || isSaving}
                className="inline-flex h-10 items-center justify-center rounded-full border border-rose-300/20 bg-rose-500/10 px-4 text-sm font-medium text-rose-200 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  )}
</section>
</div>

<div className="min-w-0 space-y-6">
  <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
    <h2 className="text-lg font-semibold text-white">Status</h2>

    <div className="mt-5 space-y-3 text-sm text-white/75">
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-white/45">Founding Artist</div>
        <div className="mt-1 font-medium text-white">
          {isFounding ? "Active" : "Not active"}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-white/45">Role</div>
        <div className="mt-1 font-medium text-white">
          {isFounding ? "Founding Artist" : role === "artist" ? "Artist" : "Listener"}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-white/45">Plan</div>
        <div className="mt-1 font-medium text-white">
          {plan === "premium"
            ? "Premium"
            : plan === "artist"
            ? "Artist"
            : plan === "lifetime"
            ? canUpload
              ? "Artist Campaign"
              : "Lifetime"
            : "Free"}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-white/45">Likes access</div>
        <div className="mt-1 font-medium text-white">
          {canLikeTracks ? "Enabled" : "Upgrade required"}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-white/45">Playlists</div>
        <div className="mt-1 font-medium text-white">
          {canCreatePlaylists ? "Enabled" : "Login required"}
        </div>
      </div>
    </div>
  </section>

  <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
    <h2 className="text-lg font-semibold text-white">Upload track</h2>
    <p className="mt-2 text-sm text-white/65">
      {canUpload
        ? "Publish a new song to your SoundioX profile and discovery feed."
        : showArtistCampaignCta
        ? "Join before Monday and unlock artist access for free forever."
        : "Unlock artist access to upload tracks and build your public SoundioX profile."}
    </p>

    <div className="mt-5 space-y-3">
      {canUpload ? (
        <>
          <Link
            href="/upload"
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-6 text-sm font-medium text-white transition hover:scale-[1.01]"
          >
            Open upload page
          </Link>

          <p className="text-xs leading-6 text-white/45">
            Upload audio, cover art, title and genre to publish a new track.
          </p>
        </>
      ) : showArtistCampaignCta ? (
        <>
          <button
            type="button"
            onClick={handleClaimArtistCampaign}
            disabled={claimingArtistCampaign}
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-gradient-to-r from-rose-600 via-red-500 to-orange-500 px-6 text-sm font-semibold text-white transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {claimingArtistCampaign
              ? "Activating..."
              : "Launch Campaign: Free Forever"}
          </button>

          <p className="text-xs leading-6 text-rose-200/90">
            Free forever if you join before Monday. No payment required.
          </p>
        </>
      ) : (
        <>
          <Link
            href="/discover"
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-6 text-sm font-medium text-white transition hover:scale-[1.01]"
          >
            Become Artist
          </Link>

          <p className="text-xs leading-6 text-white/45">
            Upgrade your access to start uploading tracks and shaping your artist profile.
          </p>
        </>
      )}
    </div>
  </section>

  <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
    <h2 className="text-lg font-semibold text-white">Following</h2>
    <p className="mt-2 text-sm text-white/60">
      Artists and profiles you currently follow.
    </p>

    <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-sm text-white/45">Following count</div>
      <div className="mt-1 text-2xl font-semibold text-white">
        {loadingFollowing ? "..." : followingCount}
      </div>
    </div>

    <div className="mt-4 space-y-3">
      {loadingFollowing ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
          Loading following...
        </div>
      ) : followingProfiles.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
          You are not following anyone yet.
        </div>
      ) : (
        followingProfiles.map((profile) => {
          const href = profile.slug ? `/artists/${profile.slug}` : "#";
          const avatar = getAvatarUrl(profile.avatar_url);

          return (
            <Link
              key={profile.id}
              href={href}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 transition hover:bg-white/8"
            >
              <div className="relative h-11 w-11 overflow-hidden rounded-full border border-white/10 bg-white/10">
                {avatar ? (
                  <Image
                    src={avatar}
                    alt={profile.display_name || "Profile"}
                    fill
                    className="object-cover"
                    sizes="44px"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-white/70">
                    {(profile.display_name || "A").charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-white">
                  {profile.display_name || "Artist"}
                </div>
                <div className="truncate text-xs text-white/45">
                  {profile.slug ? `/artists/${profile.slug}` : "Profile"}
                </div>
              </div>
            </Link>
          );
        })
      )}
    </div>
  </section>
</div>
</section>
</div>
</main>
  );
}
