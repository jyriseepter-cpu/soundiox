"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import TrackCard from "@/app/components/TrackCard";
import { usePlayer } from "@/app/components/PlayerContext";
import CustomSelect from "@/app/components/CustomSelect";
import { prepareTrackAudioFile } from "@/lib/audioProcessing";
import {
  applyLaunchCampaignArtistAccess,
  isLifetimeCampaignActive,
  LIFETIME_CAMPAIGN_END_LABEL,
  needsLaunchCampaignArtistBackfill,
  normalizeAccessPlan,
} from "@/lib/lifetimeCampaign";
import { formatEuroPrice, SOUNDIOX_PRICING } from "@/lib/pricing";
import { isSoundioXGenre, SOUNDIOX_GENRE_OPTIONS } from "@/lib/genres";

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
  lifetime_access?: boolean | null;
  lifetime_granted_at?: string | null;
  lifetime_source?: string | null;
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
  is_promo?: boolean | null;
  user_id?: string | null;
  album_id?: string | null;
  track_number?: number | null;
};

type AlbumRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  artwork_url: string | null;
  genre: string | null;
  release_date: string | null;
  is_published: boolean | null;
  created_at?: string | null;
};

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

function getOfficialGenreLabel(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  return isSoundioXGenre(raw) ? raw : "";
}

function defaultTitleFromFileName(fileName: string) {
  return fileName
    .replace(/\.[^/.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatReleaseDate(value: string | null | undefined) {
  if (!value) return "Unscheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AccountClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { playTrack } = usePlayer();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const albumArtworkInputRef = useRef<HTMLInputElement | null>(null);
  const albumTracksInputRef = useRef<HTMLInputElement | null>(null);
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
  const [myAlbums, setMyAlbums] = useState<AlbumRow[]>([]);
  const [loadingMyAlbums, setLoadingMyAlbums] = useState(false);
  const [editingTrackId, setEditingTrackId] = useState<string>("");
  const [editTitle, setEditTitle] = useState("");
  const [savingTrackId, setSavingTrackId] = useState<string>("");
  const [deletingTrackId, setDeletingTrackId] = useState<string>("");
  const [albumTitle, setAlbumTitle] = useState("");
  const [albumDescription, setAlbumDescription] = useState("");
  const [albumGenre, setAlbumGenre] = useState("");
  const [albumReleaseDate, setAlbumReleaseDate] = useState("");
  const [albumArtwork, setAlbumArtwork] = useState<File | null>(null);
  const [albumAudioFiles, setAlbumAudioFiles] = useState<File[]>([]);
  const [uploadingAlbum, setUploadingAlbum] = useState(false);
  const [albumUploadMessage, setAlbumUploadMessage] = useState("");
  const [albumArtworkDragActive, setAlbumArtworkDragActive] = useState(false);
  const [albumTracksDragActive, setAlbumTracksDragActive] = useState(false);
  const [albumPickerAlbumId, setAlbumPickerAlbumId] = useState("");
  const [albumPickerSelection, setAlbumPickerSelection] = useState<string[]>([]);
  const [savingAlbumTrackLinks, setSavingAlbumTrackLinks] = useState(false);
  const [albumPickerMessage, setAlbumPickerMessage] = useState("");

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

  const artistCampaignActive = isLifetimeCampaignActive();
  const isArtistAccount = isFounding || role === "artist" || plan === "artist";
  const canUpload = isArtistAccount;
  const canCreatePlaylists = Boolean(userId);
  const canLikeTracks =
    isFounding ||
    role === "artist" ||
    plan === "premium" ||
    plan === "artist" ||
    plan === "lifetime";

  const showArtistCampaignCta = false;
  const canUploadAlbum = useMemo(() => {
    return (
      canUpload &&
      Boolean(userId) &&
      Boolean(albumTitle.trim()) &&
      Boolean(albumGenre.trim()) &&
      albumAudioFiles.length > 0
    );
  }, [albumAudioFiles.length, albumGenre, albumTitle, canUpload, userId]);
  const albumTrackCounts = useMemo(() => {
    const counts = new Map<string, number>();

    myTracks.forEach((track) => {
      if (!track.album_id) return;
      counts.set(track.album_id, (counts.get(track.album_id) ?? 0) + 1);
    });

    return counts;
  }, [myTracks]);
  const unassignedTracks = useMemo(() => {
    return myTracks.filter((track) => !track.album_id);
  }, [myTracks]);

  async function loadProfile(user: any, options?: { skipCreate?: boolean }) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "id, email, role, display_name, bio, country, avatar_url, slug, plan, is_founding, created_at, lifetime_access, lifetime_granted_at, lifetime_source"
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

    setRole(nextRole);
    setDisplayName(nextDisplayName);
    setBio(profile?.bio || "");
    setCountry(profile?.country || "");
    setSlug(nextSlug);
    setAvatarUrl(profile?.avatar_url || "");
    setPlan(nextPlan);
    setIsFounding(nextFounding);

    if (profile && needsLaunchCampaignArtistBackfill(profile)) {
      const upgradedProfile = await applyLaunchCampaignArtistAccess({
        supabase,
        userId: user.id,
        profile: {
          email: user.email ?? null,
          display_name: nextDisplayName,
          bio: profile.bio,
          country: profile.country,
          avatar_url: profile.avatar_url,
          slug: nextSlug,
        },
      });

      setRole("artist");
      setDisplayName((upgradedProfile.display_name as string | null) || nextDisplayName);
      setBio((upgradedProfile.bio as string | null) || "");
      setCountry((upgradedProfile.country as string | null) || "");
      setSlug((upgradedProfile.slug as string | null) || nextSlug);
      setAvatarUrl((upgradedProfile.avatar_url as string | null) || "");
      setPlan("lifetime");
      setIsFounding(false);
    }

    if (!profile && !options?.skipCreate) {
      const insertPayload = {
        id: user.id,
        email: user.email ?? null,
        role: "listener",
        display_name: nextDisplayName,
        bio: null,
        country: null,
        avatar_url: null,
        slug: nextSlug,
        plan: "free",
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
      setPlan("free");
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
          "id,title,artist,genre,artwork_url,audio_url,created_at,plays_all_time,plays_this_month,is_promo,user_id"
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
          "id,title,artist,genre,artwork_url,audio_url,created_at,plays_all_time,plays_this_month,is_promo,user_id"
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
          "id,title,artist,genre,artwork_url,audio_url,created_at,plays_all_time,plays_this_month,is_promo,user_id,album_id,track_number"
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

  async function loadMyAlbums(ownerId: string) {
    setLoadingMyAlbums(true);

    try {
      const { data, error } = await supabase
        .from("albums")
        .select(
          "id,user_id,title,description,artwork_url,genre,release_date,is_published,created_at"
        )
        .eq("user_id", ownerId)
        .order("release_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setMyAlbums((data ?? []) as AlbumRow[]);
    } catch (err) {
      console.error("my albums load error:", err);
      setMyAlbums([]);
    } finally {
      setLoadingMyAlbums(false);
    }
  }

  async function uploadAlbum() {
    if (!userId || !canUploadAlbum) return;

    setUploadingAlbum(true);
    setAlbumUploadMessage("");
    setError("");
    setMessage("");

    try {
      if (!isSoundioXGenre(albumGenre.trim())) {
        throw new Error("Please select one of the official SoundioX genres.");
      }

      const albumBucket = "tracks";
      let artworkPublic: string | null = null;

      if (albumArtwork) {
        const artExt = albumArtwork.name.split(".").pop()?.toLowerCase() || "jpg";
        const artPath = `albums/${userId}/${Date.now()}-${crypto.randomUUID()}-art.${artExt}`;

        const { error: artUpErr } = await supabase.storage
          .from(albumBucket)
          .upload(artPath, albumArtwork, {
            cacheControl: "3600",
            upsert: false,
            contentType: albumArtwork.type || "image/jpeg",
          });

        if (artUpErr) {
          throw new Error(`Album artwork upload failed: ${artUpErr.message}`);
        }

        artworkPublic = supabase.storage.from(albumBucket).getPublicUrl(artPath).data.publicUrl;
      }

      const { data: albumInsert, error: albumInsertErr } = await supabase
        .from("albums")
        .insert({
          user_id: userId,
          title: albumTitle.trim(),
          description: albumDescription.trim() || null,
          artwork_url: artworkPublic,
          genre: albumGenre.trim(),
          release_date: albumReleaseDate || null,
          is_published: true,
        })
        .select(
          "id,user_id,title,description,artwork_url,genre,release_date,is_published,created_at"
        )
        .single<AlbumRow>();

      if (albumInsertErr || !albumInsert) {
        throw new Error(albumInsertErr?.message || "Album creation failed.");
      }

      const artistName =
        displayName.trim() || email.split("@")[0] || `artist-${userId.slice(0, 8)}`;

      for (let index = 0; index < albumAudioFiles.length; index += 1) {
        const sourceFile = albumAudioFiles[index];
        setAlbumUploadMessage(
          `Processing track ${index + 1} of ${albumAudioFiles.length}...`
        );

        const processedAudio = await prepareTrackAudioFile(sourceFile);
        const audioExt = processedAudio.name.split(".").pop()?.toLowerCase() || "mp3";
        const audioPath = `albums/${userId}/${albumInsert.id}/${index + 1}-${Date.now()}-${crypto.randomUUID()}.${audioExt}`;

        const { error: audioUpErr } = await supabase.storage
          .from(albumBucket)
          .upload(audioPath, processedAudio, {
            cacheControl: "3600",
            upsert: false,
            contentType: processedAudio.type || "audio/mpeg",
          });

        if (audioUpErr) {
          throw new Error(`Album track upload failed: ${audioUpErr.message}`);
        }

        const audioPublic = supabase.storage.from(albumBucket).getPublicUrl(audioPath).data.publicUrl;

        const { error: trackInsertErr } = await supabase.from("tracks").insert({
          title: defaultTitleFromFileName(sourceFile.name) || `Track ${index + 1}`,
          artist: artistName,
          genre: albumGenre.trim(),
          audio_url: audioPublic,
          artwork_url: artworkPublic,
          user_id: userId,
          is_published: true,
          is_promo: false,
          album_id: albumInsert.id,
          track_number: index + 1,
        });

        if (trackInsertErr) {
          throw new Error(`Album track insert failed: ${trackInsertErr.message}`);
        }
      }

      setAlbumTitle("");
      setAlbumDescription("");
      setAlbumGenre("");
      setAlbumReleaseDate("");
      setAlbumArtwork(null);
      setAlbumAudioFiles([]);
      setAlbumUploadMessage("Album uploaded ✅");
      setMessage("Album uploaded.");

      await Promise.all([loadMyTracks(userId), loadMyAlbums(userId)]);
    } catch (err: any) {
      setError(err?.message || "Album upload failed.");
    } finally {
      setUploadingAlbum(false);
    }
  }

  function handleAlbumArtworkSelected(file: File | null) {
    setAlbumArtwork(file);
  }

  function handleAlbumTracksSelected(files: FileList | File[]) {
    setAlbumAudioFiles(Array.from(files));
  }

  function handleDropzoneDragOver(
    event: React.DragEvent<HTMLButtonElement | HTMLDivElement>
  ) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleAlbumArtworkDrop(
    event: React.DragEvent<HTMLButtonElement | HTMLDivElement>
  ) {
    event.preventDefault();
    event.stopPropagation();
    setAlbumArtworkDragActive(false);

    const droppedFile = Array.from(event.dataTransfer.files).find((file) =>
      file.type.startsWith("image/")
    );

    if (droppedFile) {
      handleAlbumArtworkSelected(droppedFile);
    }
  }

  function handleAlbumTracksDrop(
    event: React.DragEvent<HTMLButtonElement | HTMLDivElement>
  ) {
    event.preventDefault();
    event.stopPropagation();
    setAlbumTracksDragActive(false);

    const droppedFiles = Array.from(event.dataTransfer.files).filter((file) =>
      file.type.startsWith("audio/")
    );

    if (droppedFiles.length > 0) {
      handleAlbumTracksSelected(droppedFiles);
    }
  }

  function toggleAlbumPickerTrack(trackId: string) {
    setAlbumPickerSelection((prev) =>
      prev.includes(trackId)
        ? prev.filter((id) => id !== trackId)
        : [...prev, trackId]
    );
  }

  async function attachTracksToAlbum(album: AlbumRow) {
    if (!userId || !albumPickerSelection.length) return;

    setSavingAlbumTrackLinks(true);
    setAlbumPickerMessage("");
    setError("");

    try {
      const currentAlbumTracks = myTracks
        .filter((track) => track.album_id === album.id)
        .sort(
          (a, b) => (a.track_number ?? 0) - (b.track_number ?? 0)
        );

      const currentMaxTrackNumber = currentAlbumTracks.reduce(
        (max, track) => Math.max(max, track.track_number ?? 0),
        0
      );

      for (let index = 0; index < albumPickerSelection.length; index += 1) {
        const trackId = albumPickerSelection[index];
        const nextTrackNumber = currentMaxTrackNumber + index + 1;

        const { error: updateError } = await supabase
          .from("tracks")
          .update({
            album_id: album.id,
            track_number: nextTrackNumber,
            artwork_url: album.artwork_url,
            genre: album.genre,
          })
          .eq("id", trackId)
          .eq("user_id", userId);

        if (updateError) {
          throw updateError;
        }
      }

      await Promise.all([loadMyTracks(userId), loadMyAlbums(userId)]);
      setAlbumPickerSelection([]);
      setAlbumPickerAlbumId("");
      setAlbumPickerMessage("Tracks added to album.");
    } catch (err: any) {
      setError(err?.message || "Could not add tracks to album.");
    } finally {
      setSavingAlbumTrackLinks(false);
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
          loadMyAlbums(user.id),
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
        loadMyAlbums(session.user.id),
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
      setMessage(
        `Premium plan selected (${formatEuroPrice(
          SOUNDIOX_PRICING.premium
        )}). Complete checkout to activate it.`
      );
    }

    if (selectedPlan === "artist") {
      setMessage(
        `Artist plan selected (${formatEuroPrice(
          SOUNDIOX_PRICING.artist
        )}). Complete checkout to activate it.`
      );
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

      const updatedProfile = await applyLaunchCampaignArtistAccess({
        supabase,
        userId,
        profile: {
          email: email || null,
          display_name: nextDisplayName,
          bio: bio.trim() || null,
          country: country.trim() || null,
          avatar_url: avatarUrl || null,
          slug: nextSlug || null,
        },
      });

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await loadProfile(user);
      }

      setRole("artist");
      setPlan("lifetime");
      setSlug((updatedProfile.slug as string | null) || nextSlug);
      setDisplayName(
        (updatedProfile.display_name as string | null) || nextDisplayName
      );
      setBio((updatedProfile.bio as string | null) || bio);
      setCountry((updatedProfile.country as string | null) || country);
      setAvatarUrl((updatedProfile.avatar_url as string | null) || avatarUrl);
      router.refresh();
      setMessage("Artist access activated for free forever.");
    } catch (err: any) {
      setError(err?.message || "Campaign activation failed.");
    } finally {
      setClaimingArtistCampaign(false);
    }
  }

  async function handleUpgradePlan(nextPlan: "premium" | "artist") {
    setError("");
    setMessage("");

    try {
      if (nextPlan === "artist") {
        setClaimingArtistCampaign(true);
      }

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (!session?.access_token) {
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
          tier: nextPlan,
        }),
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          payload?.message ||
            payload?.error ||
            JSON.stringify(payload) ||
            "Stripe checkout failed"
        );
      }

      if (payload?.url) {
        window.location.href = payload.url;
        return;
      }

      throw new Error("Checkout URL missing");
    } catch (err: any) {
      setError(err?.message || "Checkout failed.");
    } finally {
      if (nextPlan === "artist") {
        setClaimingArtistCampaign(false);
      }
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
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleUpgradePlan("artist")}
                      disabled={claimingArtistCampaign}
                      className="rounded-full border border-rose-300/25 bg-gradient-to-r from-rose-600 via-red-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {claimingArtistCampaign ? "Opening..." : "Become Artist"}
                    </button>
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
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
              <h2 className="text-lg font-semibold text-white">
                Artist access
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/75">
                Unlock artist access to upload tracks, manage releases, and build your public SoundioX profile.
              </p>

              <div className="mt-5">
                {
                  <button
                    type="button"
                    onClick={() => void handleUpgradePlan("artist")}
                    disabled={claimingArtistCampaign}
                    className="inline-flex h-12 items-center justify-center rounded-full bg-gradient-to-r from-rose-600 via-red-500 to-orange-500 px-6 text-sm font-semibold text-white transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {claimingArtistCampaign ? "Opening..." : "Become Artist"}
                  </button>
                }
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
              <h2 className="text-lg font-semibold text-white">
                Premium listener
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/65">
                Premium unlocks monthly likes while keeping playlists available
                on your account for {formatEuroPrice(SOUNDIOX_PRICING.premium)}.
              </p>

              <div className="mt-5">
                <Link
                  href="/discover"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-white/8 px-6 text-sm font-medium text-white transition hover:bg-white/12"
                >
                  Upgrade to Premium • {formatEuroPrice(SOUNDIOX_PRICING.premium)}
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
      <h2 className="text-lg font-semibold text-white">My Albums</h2>
      <p className="mt-1 text-sm text-white/60">
        Larger release cards for your projects and multi-track drops.
      </p>
    </div>

    <div className="text-sm font-medium text-white/55">{myAlbums.length} total</div>
  </div>

  {loadingMyAlbums ? (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
      Loading albums...
    </div>
  ) : myAlbums.length === 0 ? (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
      No albums uploaded yet.
    </div>
  ) : (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {myAlbums.map((album) => {
        const artworkSrc = getAvatarUrl(album.artwork_url) || "/logo-new.png";
        const isPickerOpen = albumPickerAlbumId === album.id;

        return (
          <div key={album.id} className="group relative">
            <div
              onClick={() => router.push(`/albums/${album.id}`)}
              className="cursor-pointer rounded-[28px] border border-white/10 bg-black/20 p-4 transition hover:border-cyan-300/25 hover:bg-white/8"
            >
              <div className="relative aspect-square overflow-hidden rounded-[24px] border border-white/10 bg-white/5">
                <Image
                  src={artworkSrc}
                  alt={album.title || "Album artwork"}
                  fill
                  className="object-cover transition duration-300 group-hover:scale-[1.02]"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
              </div>

              <div className="mt-4">
                <div className="text-lg font-semibold text-white">
                  {album.title || "Untitled album"}
                </div>
                <div className="mt-1 text-sm text-white/60">
                  {getOfficialGenreLabel(album.genre) || "No genre"} •{" "}
                  {formatReleaseDate(album.release_date)}
                </div>
                <div className="mt-2 text-xs text-white/55">
                  {albumTrackCounts.get(album.id) ?? 0} track
                  {(albumTrackCounts.get(album.id) ?? 0) === 1 ? "" : "s"}
                </div>
              </div>
            </div>

            <div className="absolute right-2 top-2 flex gap-2 opacity-0 transition group-hover:opacity-100">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setAlbumPickerMessage("");
                  setAlbumPickerSelection([]);
                  setAlbumPickerAlbumId((current) =>
                    current === album.id ? "" : album.id
                  );
                }}
                className="rounded bg-cyan-500/20 px-2 py-1 text-xs text-cyan-200 hover:bg-cyan-500/35"
              >
                Add tracks
              </button>

              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  const newTitle = window.prompt("Edit album title", album.title);
                  if (!newTitle) return;

                  await supabase
                    .from("albums")
                    .update({ title: newTitle })
                    .eq("id", album.id);

                  window.location.reload();
                }}
                className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
              >
                Edit
              </button>

              <button
                onClick={async (e) => {
                  e.stopPropagation();

                  if (!window.confirm("Delete this album?")) return;

                  await supabase.from("albums").delete().eq("id", album.id);
                  window.location.reload();
                }}
                className="rounded bg-red-500/20 px-2 py-1 text-xs text-red-300 hover:bg-red-500/40"
              >
                Delete
              </button>
            </div>

            {isPickerOpen ? (
              <div className="mt-3 rounded-[24px] border border-white/10 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">
                      Add tracks to {album.title || "album"}
                    </div>
                    <div className="mt-1 text-xs text-white/55">
                      Only tracks not already assigned to an album are shown.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setAlbumPickerAlbumId("");
                      setAlbumPickerSelection([]);
                    }}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70 hover:bg-white/10"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  {unassignedTracks.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/60">
                      No available tracks. Upload or detach a track first.
                    </div>
                  ) : (
                    unassignedTracks.map((track) => (
                      <label
                        key={track.id}
                        className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 transition hover:bg-white/10"
                      >
                        <input
                          type="checkbox"
                          checked={albumPickerSelection.includes(track.id)}
                          onChange={() => toggleAlbumPickerTrack(track.id)}
                          className="h-4 w-4 rounded border-white/20 bg-transparent text-cyan-300"
                        />

                        <div className="min-w-0">
                          <div className="truncate font-medium text-white">
                            {track.title || "Untitled"}
                          </div>
                          <div className="truncate text-xs text-white/50">
                            {getOfficialGenreLabel(track.genre) || "No genre"}
                          </div>
                        </div>
                      </label>
                    ))
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void attachTracksToAlbum(album)}
                    disabled={!albumPickerSelection.length || savingAlbumTrackLinks}
                    className="inline-flex h-10 items-center justify-center rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-4 text-sm font-medium text-white transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingAlbumTrackLinks ? "Adding..." : "Add selected tracks"}
                  </button>

                  {albumPickerSelection.length > 0 ? (
                    <div className="text-xs text-white/55">
                      {albumPickerSelection.length} track
                      {albumPickerSelection.length === 1 ? "" : "s"} selected
                    </div>
                  ) : null}

                  {albumPickerMessage ? (
                    <div className="text-xs text-emerald-200">{albumPickerMessage}</div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
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
      {likedTracks.map((track, index) => (
        <TrackCard
          key={`${track.id}-${index}`}
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
      ) : (
        <>
          <button
            type="button"
            onClick={() => void handleUpgradePlan("artist")}
            disabled={claimingArtistCampaign}
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-gradient-to-r from-rose-600 via-red-500 to-orange-500 px-6 text-sm font-semibold text-white transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {claimingArtistCampaign ? "Opening..." : "Become Artist • "}
            {claimingArtistCampaign ? "" : formatEuroPrice(SOUNDIOX_PRICING.artist)}
          </button>

          <p className="text-xs leading-6 text-white/45">
            Upgrade your access to start uploading tracks and shaping your artist profile for {formatEuroPrice(
              SOUNDIOX_PRICING.artist
            )}.
          </p>
        </>
      )}
    </div>
  </section>

  <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
    <h2 className="text-lg font-semibold text-white">Upload album</h2>
    <p className="mt-2 text-sm text-white/65">
      {canUpload
        ? "Create a release with one cover image and multiple tracks in a fixed order."
        : "Unlock artist access to upload albums and organize releases."}
    </p>

    <div className="mt-5 space-y-4">
      {canUpload ? (
        <>
          <div>
            <label className="mb-2 block text-sm text-white/75">Album title</label>
            <input
              value={albumTitle}
              onChange={(e) => setAlbumTitle(e.target.value)}
              placeholder="Album title"
              className="h-12 w-full rounded-2xl border border-white/10 bg-white/6 px-4 text-white outline-none transition placeholder:text-white/30 focus:border-cyan-300/40"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/75">Genre</label>
            <CustomSelect
              value={albumGenre}
              onChange={setAlbumGenre}
              options={SOUNDIOX_GENRE_OPTIONS}
              className="w-full"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/75">Release date</label>
            <input
              type="date"
              value={albumReleaseDate}
              onChange={(e) => setAlbumReleaseDate(e.target.value)}
              className="h-12 w-full rounded-2xl border border-white/10 bg-white/6 px-4 text-white outline-none transition focus:border-cyan-300/40"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/75">Description</label>
            <textarea
              value={albumDescription}
              onChange={(e) => setAlbumDescription(e.target.value)}
              rows={4}
              placeholder="Short album story, credits, or release notes..."
              className="w-full rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-cyan-300/40"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/75">Album artwork</label>
            <input
              ref={albumArtworkInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleAlbumArtworkSelected(e.target.files?.[0] || null)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => albumArtworkInputRef.current?.click()}
              onDragEnter={() => setAlbumArtworkDragActive(true)}
              onDragOver={handleDropzoneDragOver}
              onDragLeave={() => setAlbumArtworkDragActive(false)}
              onDrop={handleAlbumArtworkDrop}
              className={`flex w-full cursor-pointer flex-col items-center justify-center rounded-[24px] border border-dashed px-4 py-6 text-center transition ${
                albumArtworkDragActive
                  ? "border-cyan-300/60 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(103,232,249,0.18)]"
                  : "border-white/15 bg-white/6 hover:border-cyan-300/35 hover:bg-white/10"
              }`}
            >
              <span className="text-sm font-medium text-white">
                Click or drop album artwork here
              </span>
              <span className="mt-2 text-xs text-white/50">
                Accepts one image file for the album cover.
              </span>
              {albumArtwork ? (
                <span className="mt-3 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/70">
                  {albumArtwork.name}
                </span>
              ) : null}
            </button>
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/75">Album tracks</label>
            <input
              ref={albumTracksInputRef}
              type="file"
              accept="audio/*"
              multiple
              onChange={(e) => handleAlbumTracksSelected(e.target.files ?? [])}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => albumTracksInputRef.current?.click()}
              onDragEnter={() => setAlbumTracksDragActive(true)}
              onDragOver={handleDropzoneDragOver}
              onDragLeave={() => setAlbumTracksDragActive(false)}
              onDrop={handleAlbumTracksDrop}
              className={`flex w-full cursor-pointer flex-col items-center justify-center rounded-[24px] border border-dashed px-4 py-6 text-center transition ${
                albumTracksDragActive
                  ? "border-cyan-300/60 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(103,232,249,0.18)]"
                  : "border-white/15 bg-white/6 hover:border-cyan-300/35 hover:bg-white/10"
              }`}
            >
              <span className="text-sm font-medium text-white">
                Click or drop album tracks here
              </span>
              <span className="mt-2 text-xs text-white/50">
                Accepts multiple audio files and keeps your selected order.
              </span>
              {albumAudioFiles.length > 0 ? (
                <span className="mt-3 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/70">
                  {albumAudioFiles.length} file{albumAudioFiles.length === 1 ? "" : "s"} selected
                </span>
              ) : null}
            </button>
            <p className="mt-2 text-xs leading-6 text-white/45">
              Track titles default from filenames and order follows your selected files.
            </p>
          </div>

          {albumAudioFiles.length > 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-sm font-medium text-white">Track order preview</div>
              <div className="mt-3 space-y-2">
                {albumAudioFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2"
                  >
                    <div className="text-xs text-white/45">Track {index + 1}</div>
                    <div className="truncate text-sm font-medium text-white">
                      {defaultTitleFromFileName(file.name) || `Track ${index + 1}`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={uploadAlbum}
            disabled={!canUploadAlbum || uploadingAlbum}
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-6 text-sm font-medium text-white transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploadingAlbum ? "Uploading album..." : "Upload album"}
          </button>

          {albumUploadMessage ? (
            <p className="text-xs leading-6 text-white/45">{albumUploadMessage}</p>
          ) : null}
        </>
      ) : (
        <p className="text-xs leading-6 text-white/45">
          Become an artist to upload albums from your account page.
        </p>
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
