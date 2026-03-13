"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import type { Track } from "@/app/components/PlayerContext";

type Playlist = {
  id: string;
  name: string;
  created_at: string;
  user_id: string;
};

type FeaturedArtist = {
  id: string;
  display_name: string | null;
  bio: string | null;
  country: string | null;
  avatar_url: string | null;
  slug: string | null;
  is_pro: boolean | null;
  is_founding: boolean | null;
  like_count_month: number | null;
};

type Props = {
  artistName: string;
  genre: string;
  selectedTitle: string;
  artworkSrc: string;

  tracks: Track[];
  onSelectTrack: (t: Track) => void;
  onPlayClick: (t: Track) => void;

  isPlaying: boolean;
  currentTrackId: string | null;

  onUpgradePlan: (plan: "premium" | "artist_pro") => Promise<void>;
  selectedTrack: Track | null;
};

const glassBox = "rounded-2xl bg-white/8 ring-1 ring-white/10 p-3";

const playlistInputClass =
  "h-10 rounded-xl px-3 text-sm font-medium text-white placeholder:text-white/40 ring-1 ring-white/10 " +
  "bg-gradient-to-r from-cyan-500/35 via-sky-500/25 to-fuchsia-500/30 backdrop-blur outline-none";

const playlistSelectClass =
  "h-10 rounded-xl px-3 text-sm font-medium text-white ring-1 ring-cyan-300/25 " +
  "bg-cyan-400/85 backdrop-blur outline-none";

const createBtnClass =
  "h-10 rounded-xl px-4 text-sm font-bold text-white ring-1 ring-white/15 " +
  "bg-gradient-to-r from-purple-600 to-fuchsia-500 hover:opacity-95 disabled:opacity-50";

const addBtnClass =
  "h-10 rounded-xl px-4 text-sm font-bold text-white ring-1 ring-cyan-200/20 " +
  "bg-cyan-400 hover:bg-cyan-300 disabled:opacity-40";

const playBtnClass =
  "h-9 rounded-xl px-4 text-sm font-bold text-white ring-1 ring-white/15 " +
  "bg-gradient-to-r from-teal-500/70 to-fuchsia-500/70 hover:from-teal-500/85 hover:to-fuchsia-500/85";

export default function ArtistPanel(props: Props) {
  const {
    artistName,
    genre,
    selectedTitle,
    artworkSrc,
    tracks,
    onPlayClick,
    isPlaying,
    currentTrackId,
    onUpgradePlan,
    selectedTrack,
  } = props;

  const [user, setUser] = useState<any>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [upgradeLoading, setUpgradeLoading] = useState<"premium" | "artist_pro" | null>(null);

  const [featuredArtists, setFeaturedArtists] = useState<FeaturedArtist[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);

  const canUsePlaylists = !!user;

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user ?? null);
    };
    void loadUser();
  }, []);

  const fetchPlaylists = async () => {
    if (!user?.id) return;

    const { data } = await supabase
      .from("playlists")
      .select("id,name,created_at,user_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    const list = (data ?? []) as Playlist[];
    setPlaylists(list);

    if (!selectedPlaylistId && list[0]?.id) {
      setSelectedPlaylistId(list[0].id);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    void fetchPlaylists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    let ignore = false;

    async function fetchFeaturedArtists() {
      try {
        setFeaturedLoading(true);

        const { data, error } = await supabase
          .from("profiles")
          .select(
            "id, display_name, bio, country, avatar_url, slug, is_pro, is_founding, like_count_month"
          )
          .eq("role", "artist")
          .order("is_founding", { ascending: false })
          .order("like_count_month", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(4);

        if (error) {
          console.error("Featured artists load error:", error.message);
          if (!ignore) setFeaturedArtists([]);
          return;
        }

        if (!ignore) {
          setFeaturedArtists((data as FeaturedArtist[]) ?? []);
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

  const createPlaylist = async () => {
    if (!user) {
      alert("Please log in first.");
      return;
    }

    const name = newPlaylistName.trim();
    if (!name) {
      alert("Enter playlist name.");
      return;
    }

    const { data, error } = await supabase
      .from("playlists")
      .insert([{ name, user_id: user.id }])
      .select("id,name,created_at,user_id")
      .single();

    if (error) {
      console.error(error);
      alert("Create failed.");
      return;
    }

    setNewPlaylistName("");
    await fetchPlaylists();

    if (data?.id) setSelectedPlaylistId(data.id);
  };

  const addSelectedTrackToPlaylist = async () => {
    if (!user || !selectedTrack?.id || !selectedPlaylistId) return;

    const { error } = await supabase.from("playlist_tracks").insert([
      {
        playlist_id: selectedPlaylistId,
        track_id: selectedTrack.id,
      },
    ]);

    if (error) {
      alert("Already in playlist or error.");
      return;
    }

    alert("Added to playlist ✅");
  };

  const topTracks = useMemo(() => tracks.slice(0, 8), [tracks]);

  async function handleUpgrade(plan: "premium" | "artist_pro") {
    try {
      setUpgradeLoading(plan);
      await onUpgradePlan(plan);
    } finally {
      setUpgradeLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <img
          src={artworkSrc || "/logo-new.png"}
          alt="art"
          className="h-12 w-12 rounded-xl object-cover ring-1 ring-white/10"
        />
        <div>
          <div className="text-base font-bold text-white">{artistName}</div>
          <div className="text-sm font-semibold text-white/65">Genre: {genre}</div>
        </div>
      </div>

      <div className={glassBox}>
        <div className="mb-2 text-xs font-bold tracking-widest text-white/60">
          TRACKS
        </div>

        <div className="space-y-2">
          {topTracks.map((t) => {
            const isCurrent =
              currentTrackId != null && String(currentTrackId) === String(t.id);

            return (
              <div
                key={String(t.id)}
                className="flex items-center justify-between rounded-xl bg-white/8 px-3 py-2"
              >
                <div className="truncate text-sm font-bold text-white/95">
                  {(t.title ?? (t as any).name ?? "Untitled").toString()}
                </div>

                <button onClick={() => onPlayClick(t)} className={playBtnClass}>
                  {isCurrent && isPlaying ? "Playing" : "Play"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <button
          onClick={() => handleUpgrade("premium")}
          disabled={upgradeLoading !== null}
          className="h-10 w-full rounded-xl bg-yellow-400 font-bold text-black hover:bg-yellow-300 disabled:opacity-60"
        >
          {upgradeLoading === "premium" ? "Opening..." : "Upgrade to Premium"}
        </button>

        <button
          onClick={() => handleUpgrade("artist_pro")}
          disabled={upgradeLoading !== null}
          className="h-10 w-full rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-500 font-bold text-white hover:opacity-95 disabled:opacity-60"
        >
          {upgradeLoading === "artist_pro" ? "Opening..." : "Become Artist"}
        </button>
      </div>

      <div className={glassBox}>
        <div className="mb-2 text-xs font-bold tracking-widest text-white/60">
          PLAYLISTS
        </div>

        {!canUsePlaylists ? (
          <div className="text-sm font-semibold text-white/60">
            Log in to create playlists.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="New playlist..."
                className={`flex-1 ${playlistInputClass}`}
              />
              <button onClick={createPlaylist} className={createBtnClass}>
                Create
              </button>
            </div>

            <div className="flex gap-2">
              <select
                value={selectedPlaylistId}
                onChange={(e) => setSelectedPlaylistId(e.target.value)}
                className={`flex-1 ${playlistSelectClass}`}
              >
                <option value="" disabled>
                  Select playlist...
                </option>
                {playlists.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <button onClick={addSelectedTrackToPlaylist} className={addBtnClass}>
                Add
              </button>
            </div>

            <div className="text-xs font-semibold text-white/45">
              Selected track:{" "}
              <span className="text-white/75">
                {selectedTrack ? selectedTitle : "—"}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className={glassBox}>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-bold tracking-widest text-white/60">
            FEATURED ARTISTS
          </div>

          <Link
            href="/artists"
            className="text-xs font-bold text-cyan-300 hover:text-cyan-200"
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
                (artist.display_name || "AI")
                  .split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase() || "AI";

              return (
                <Link
                  key={artist.id}
                  href={href}
                  className="block rounded-xl bg-white/8 px-3 py-2 transition hover:bg-white/12"
                >
                  <div className="flex items-center gap-3">
                    {artist.avatar_url ? (
                      <img
                        src={artist.avatar_url}
                        alt={artist.display_name || "Artist"}
                        className={`h-10 w-10 rounded-full object-cover ${
                          artist.is_founding
                            ? "ring-2 ring-amber-400/80"
                            : "ring-1 ring-white/10"
                        }`}
                      />
                    ) : (
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white ${
                          artist.is_founding
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
                          {artist.display_name || "Unnamed artist"}
                        </div>

                        {artist.is_founding ? (
                          <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-200 ring-1 ring-amber-300/20">
                            Founding
                          </span>
                        ) : null}

                        {artist.is_pro ? (
                          <span className="rounded-full bg-fuchsia-400/15 px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-200 ring-1 ring-fuchsia-300/20">
                            Artist
                          </span>
                        ) : null}
                      </div>

                      <div className="truncate text-xs font-semibold text-white/55">
                        {artist.bio?.trim()
                          ? artist.bio
                          : artist.country?.trim()
                          ? artist.country
                          : `Pulse likes: ${artist.like_count_month ?? 0}`}
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