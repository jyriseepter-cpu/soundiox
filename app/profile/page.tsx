"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import TrackCard from "@/app/components/TrackCard";
import { usePlayer } from "@/app/components/PlayerContext";

type TrackRow = {
  id: string;
  title: string | null;
  artist: string | null;
  genre: string | null;
  audio_url: string | null;
  artwork_url: string | null;
  created_at: string | null;
  plays_all_time: number | null;
  likes_this_month?: number | null;
};

type Playlist = {
  id: string;
  name: string;
};

type PlaylistTrackRow = {
  playlist_id: string;
  track_id: string;
  tracks: TrackRow | TrackRow[] | null;
};

type LikeTrackRow = {
  track_id: string;
  tracks: TrackRow | TrackRow[] | null;
};

export default function ProfilePage() {
  const { playTrack } = usePlayer();

  const [loading, setLoading] = useState(true);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>("");
  const [playlistTracks, setPlaylistTracks] = useState<TrackRow[]>([]);
  const [likedTracks, setLikedTracks] = useState<TrackRow[]>([]);

  useEffect(() => {
    let active = true;

    async function loadProfileData() {
      try {
        setLoading(true);

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (!active) return;
          setPlaylists([]);
          setSelectedPlaylistId("");
          setPlaylistTracks([]);
          setLikedTracks([]);
          return;
        }

        const { data: playlistsData, error: playlistsError } = await supabase
          .from("playlists")
          .select("id,name")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (playlistsError) throw playlistsError;

        const safePlaylists = (playlistsData ?? []) as Playlist[];

        if (!active) return;

        setPlaylists(safePlaylists);

        const nextSelectedPlaylistId = safePlaylists[0]?.id ?? "";
        setSelectedPlaylistId(nextSelectedPlaylistId);

        if (nextSelectedPlaylistId) {
          const { data: playlistTracksData, error: playlistTracksError } = await supabase
            .from("playlist_tracks")
            .select(
              `
              playlist_id,
              track_id,
              tracks (
                id,
                title,
                artist,
                genre,
                audio_url,
                artwork_url,
                created_at,
                plays_all_time
              )
            `
            )
            .eq("playlist_id", nextSelectedPlaylistId);

          if (playlistTracksError) throw playlistTracksError;

          const safePlaylistTracks = ((playlistTracksData ?? []) as PlaylistTrackRow[])
            .map((row) =>
              Array.isArray(row.tracks) ? row.tracks[0] ?? null : row.tracks ?? null
            )
            .filter((track): track is TrackRow => Boolean(track));

          if (!active) return;
          setPlaylistTracks(safePlaylistTracks);
        } else {
          setPlaylistTracks([]);
        }

        const monthStart = `${new Date().getFullYear()}-${String(
          new Date().getMonth() + 1
        ).padStart(2, "0")}-01`;

        const { data: likedTracksData, error: likedTracksError } = await supabase
          .from("likes")
          .select(
            `
            track_id,
            tracks (
              id,
              title,
              artist,
              genre,
              audio_url,
              artwork_url,
              created_at,
              plays_all_time
            )
          `
          )
          .eq("user_id", user.id)
          .eq("month", monthStart);

        if (likedTracksError) throw likedTracksError;

        const safeLikedTracks = ((likedTracksData ?? []) as LikeTrackRow[])
          .map((row) => (Array.isArray(row.tracks) ? row.tracks[0] ?? null : row.tracks ?? null))
          .filter((track): track is TrackRow => Boolean(track));

        if (!active) return;
        setLikedTracks(safeLikedTracks);
      } catch (error) {
        console.error("Profile page load error:", error);
        if (!active) return;
        setPlaylists([]);
        setSelectedPlaylistId("");
        setPlaylistTracks([]);
        setLikedTracks([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadProfileData();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSelectedPlaylistTracks() {
      if (!selectedPlaylistId) {
        setPlaylistTracks([]);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("playlist_tracks")
          .select(
            `
            playlist_id,
            track_id,
            tracks (
              id,
              title,
              artist,
              genre,
              audio_url,
              artwork_url,
              created_at,
              plays_all_time
            )
          `
          )
          .eq("playlist_id", selectedPlaylistId);

        if (error) throw error;

        const safeTracks = ((data ?? []) as PlaylistTrackRow[])
          .map((row) => (Array.isArray(row.tracks) ? row.tracks[0] ?? null : row.tracks ?? null))
          .filter((track): track is TrackRow => Boolean(track));

        if (!active) return;
        setPlaylistTracks(safeTracks);
      } catch (error) {
        console.error("Selected playlist tracks load error:", error);
        if (!active) return;
        setPlaylistTracks([]);
      }
    }

    void loadSelectedPlaylistTracks();

    return () => {
      active = false;
    };
  }, [selectedPlaylistId]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 text-white">
      <h1 className="mb-6 text-3xl font-bold">Profile</h1>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white/70">
          Loading...
        </div>
      ) : (
        <div className="space-y-8">
          <div>
            <h2 className="mb-3 text-lg font-semibold">My Playlists</h2>

            {playlists.length > 0 ? (
              <div className="mb-4 flex flex-wrap gap-2">
                {playlists.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPlaylistId(p.id)}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      selectedPlaylistId === p.id
                        ? "bg-cyan-400 text-black"
                        : "bg-white/10 text-white hover:bg-white/15"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-white/60">
                No playlists yet.
              </div>
            )}

            <div className="mt-4 space-y-2">
              {playlistTracks.map((t) => (
                <TrackCard
                  key={t.id}
                  track={t as any}
                  allTracks={playlistTracks as any}
                  onPlay={() => playTrack(t as any, playlistTracks as any)}
                />
              ))}
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-lg font-semibold">My Likes</h2>

            <div className="space-y-2">
              {likedTracks.map((t) => (
                <TrackCard
                  key={t.id}
                  track={t as any}
                  allTracks={likedTracks as any}
                  onPlay={() => playTrack(t as any, likedTracks as any)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}