"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import TrackCard from "@/app/components/TrackCard";
import { usePlayer } from "@/app/components/PlayerContext";

type Track = {
  id: string;
  title: string | null;
  artist: string | null;
  genre: string | null;
  artwork_url: string | null;
  audio_url: string | null;
};

type Playlist = {
  id: string;
  name: string;
};

export default function ProfilePage() {
  const { playTrack } = usePlayer();

  const [user, setUser] = useState<any>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [likedTracks, setLikedTracks] = useState<Track[]>([]);
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);

  // 🔹 load user
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user ?? null);
    };
    load();
  }, []);

  // 🔹 load playlists
  useEffect(() => {
    if (!user?.id) return;

    const load = async () => {
      const { data } = await supabase
        .from("playlists")
        .select("id,name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setPlaylists(data ?? []);
    };

    load();
  }, [user]);

  // 🔹 load liked tracks
  useEffect(() => {
    if (!user?.id) return;

    const load = async () => {
      const { data } = await supabase
        .from("likes")
        .select("track_id")
        .eq("user_id", user.id);

      const ids = (data ?? []).map((l) => l.track_id);

      if (ids.length === 0) {
        setLikedTracks([]);
        return;
      }

      const { data: tracks } = await supabase
        .from("tracks")
        .select("*")
        .in("id", ids);

      setLikedTracks(tracks ?? []);
    };

    load();
  }, [user]);

  // 🔹 load playlist tracks
  useEffect(() => {
    if (!selectedPlaylistId) {
      setPlaylistTracks([]);
      return;
    }

    const load = async () => {
      const { data } = await supabase
        .from("playlist_tracks")
        .select("track_id")
        .eq("playlist_id", selectedPlaylistId);

      const ids = (data ?? []).map((t) => t.track_id);

      if (ids.length === 0) {
        setPlaylistTracks([]);
        return;
      }

      const { data: tracks } = await supabase
        .from("tracks")
        .select("*")
        .in("id", ids);

      setPlaylistTracks(tracks ?? []);
    };

    load();
  }, [selectedPlaylistId]);

  if (!user) {
    return (
      <div className="p-6 text-white/70">
        Please log in to view your profile.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 text-white">
      <h1 className="mb-6 text-2xl font-bold">Your Profile</h1>

      {/* PLAYLISTS */}
      <div className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">My Playlists</h2>

        <div className="flex flex-wrap gap-2">
          {playlists.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPlaylistId(p.id)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                selectedPlaylistId === p.id
                  ? "bg-cyan-400 text-white"
                  : "bg-white/10 text-white/80"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {playlistTracks.map((t) => (
            <TrackCard
              key={t.id}
              track={t as any}
              onPlay={() => playTrack(t as any, playlistTracks as any)}
            />
          ))}
        </div>
      </div>

      {/* LIKES */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">My Likes</h2>

        <div className="space-y-2">
          {likedTracks.map((t) => (
            <TrackCard
              key={t.id}
              track={t as any}
              onPlay={() => playTrack(t as any, likedTracks as any)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}