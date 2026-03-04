"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Track } from "@/app/components/PlayerContext";

type Playlist = {
  id: string;
  name: string;
  created_at: string;
  user_id: string;
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

  // ✅ tagasi 2-tier peale
  onUpgradePlan: (plan: "premium" | "artist_pro") => Promise<void>;

  // ✅ hoian olemas, sest sul Discoveris on selectedTrack state
  selectedTrack: Track | null;
};

const glassBox = "rounded-2xl bg-white/8 ring-1 ring-white/10 p-3";

const inputClass =
  "h-9 rounded-xl px-3 text-sm text-white placeholder:text-white/40 ring-1 ring-white/10 " +
  "bg-gradient-to-r from-teal-500/20 via-sky-500/15 to-fuchsia-500/20 backdrop-blur";

const selectClass =
  "h-9 rounded-xl px-3 text-sm text-white ring-1 ring-white/10 " +
  "bg-gradient-to-r from-teal-500/20 via-sky-500/15 to-fuchsia-500/20 backdrop-blur";

const btnGradient =
  "h-9 rounded-xl px-4 text-sm font-medium text-white ring-1 ring-white/15 " +
  "bg-gradient-to-r from-teal-500/70 to-fuchsia-500/70 hover:from-teal-500/85 hover:to-fuchsia-500/85";

const btnGlass =
  "h-9 rounded-xl px-4 text-sm font-medium text-white ring-1 ring-white/12 bg-white/10 hover:bg-white/15";

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

  const canUsePlaylists = !!user;

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user ?? null);
    };
    loadUser();
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
    fetchPlaylists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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
      {/* Header */}
      <div className="flex items-center gap-3">
        <img
          src={artworkSrc || "/logo-new.png"}
          alt="art"
          className="h-12 w-12 rounded-xl object-cover ring-1 ring-white/10"
        />
        <div>
          <div className="text-white font-semibold">{artistName}</div>
          <div className="text-white/60 text-sm">Genre: {genre}</div>
        </div>
      </div>

      {/* Mini Tracks */}
      <div className={glassBox}>
        <div className="text-xs font-semibold tracking-widest text-white/60 mb-2">
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
                <div className="text-white/90 text-sm truncate">
                  {(t.title ?? (t as any).name ?? "Untitled").toString()}
                </div>

                <button onClick={() => onPlayClick(t)} className={btnGradient}>
                  {isCurrent && isPlaying ? "Playing" : "Play"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Upgrade Buttons (MONTHLY ONLY) */}
      <div className="space-y-2">
        <button
          onClick={() => handleUpgrade("premium")}
          disabled={upgradeLoading !== null}
          className="w-full h-10 rounded-xl font-semibold text-black bg-yellow-400 hover:bg-yellow-300 disabled:opacity-60"
        >
          {upgradeLoading === "premium" ? "…" : "Upgrade to Premium (€5.99 / month)"}
        </button>

        <button
          onClick={() => handleUpgrade("artist_pro")}
          disabled={upgradeLoading !== null}
          className="w-full h-10 rounded-xl font-semibold text-white bg-gradient-to-r from-purple-600 to-fuchsia-500 hover:opacity-95 disabled:opacity-60"
        >
          {upgradeLoading === "artist_pro" ? "…" : "Become Artist Pro (€14.99 / month)"}
        </button>
      </div>

      {/* Playlists */}
      <div className={glassBox}>
        <div className="text-xs font-semibold tracking-widest text-white/60 mb-2">
          PLAYLISTS
        </div>

        {!canUsePlaylists ? (
          <div className="text-white/60 text-sm">Log in to create playlists.</div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="New playlist..."
                className={`flex-1 ${inputClass}`}
              />
              <button onClick={createPlaylist} className={btnGradient}>
                Create
              </button>
            </div>

            <div className="flex gap-2">
              <select
                value={selectedPlaylistId}
                onChange={(e) => setSelectedPlaylistId(e.target.value)}
                className={`flex-1 ${selectClass}`}
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

              <button onClick={addSelectedTrackToPlaylist} className={btnGlass}>
                Add
              </button>
            </div>

            <div className="text-xs text-white/40">
              Selected track:{" "}
              <span className="text-white/70">
                {selectedTrack ? selectedTitle : "—"}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}