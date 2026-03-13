"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Track } from "@/app/components/PlayerContext";

type Playlist = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};

type Props = {
  addNowTrack?: Track | null;
  onAddHandled?: () => void;
  onPlaylistSelected?: (playlistId: string) => void;
  onTrackSelected?: (t: Track | null) => void;
};

function pickTitle(t: Track) {
  return (t.title ?? (t as any).name ?? "Untitled").toString();
}
function pickArtist(t: Track) {
  return (t.artist ?? "AI Artist").toString();
}

export default function PlaylistsPanel(props: Props) {
  const [userId, setUserId] = useState<string | null>(null);

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>("");

  const selectedPlaylist = useMemo(
    () => playlists.find((p) => p.id === selectedPlaylistId) ?? null,
    [playlists, selectedPlaylistId]
  );

  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState(false);

  const [notice, setNotice] = useState<string>("");

  // user init
  useEffect(() => {
    let alive = true;

    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id ?? null;
      if (!alive) return;
      setUserId(uid);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setPlaylists([]);
      setSelectedPlaylistId("");
      return;
    }

    void fetchPlaylists();
  }, [userId]);

  async function fetchPlaylists() {
    if (!userId) return;

    try {
      setLoadingPlaylists(true);

      const { data } = await supabase
        .from("playlists")
        .select("id,user_id,name,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

        const list = (data ?? []) as Playlist[];

        setPlaylists(list);

      if (!selectedPlaylistId && data && data.length > 0) {
        const firstId = data[0].id;
        setSelectedPlaylistId(firstId);
        props.onPlaylistSelected?.(firstId);
      }
    } finally {
      setLoadingPlaylists(false);
    }
  }

  async function createPlaylist() {
    const name = newName.trim();
    if (!name || !userId) return;

    try {
      setCreating(true);

      const { data, error } = await supabase
        .from("playlists")
        .insert({ user_id: userId, name })
        .select("id,user_id,name,created_at")
        .single();

      if (error) throw error;

      setNewName("");

      const created = data as Playlist;

      setPlaylists((prev) => [created, ...prev]);

      setSelectedPlaylistId(created.id);

      props.onPlaylistSelected?.(created.id);
    } catch {
      setNotice("Could not create playlist.");
    } finally {
      setCreating(false);
    }
  }

  async function addTrackToSelectedPlaylist(track: Track) {
    if (!userId) {
      setNotice("Please log in to use playlists.");
      return;
    }

    if (!selectedPlaylistId) {
      setNotice("Select a playlist first.");
      return;
    }

    try {
      setAdding(true);

      const trackId = (track as any).id as string | undefined;

      if (!trackId) {
        setNotice("This track has no id.");
        return;
      }

      const { data: exists } = await supabase
        .from("playlist_tracks")
        .select("id")
        .eq("playlist_id", selectedPlaylistId)
        .eq("track_id", trackId)
        .maybeSingle();

      if (exists?.id) {
        setNotice("This track is already in that playlist.");
        return;
      }

      const { error } = await supabase.from("playlist_tracks").insert({
        playlist_id: selectedPlaylistId,
        track_id: trackId,
      });

      if (error) throw error;

      setNotice("Added ✅");

      setTimeout(() => setNotice(""), 1200);
    } catch {
      setNotice("Could not add track.");
    } finally {
      setAdding(false);
    }
  }

  useEffect(() => {
    const t = props.addNowTrack ?? null;

    if (!t) return;

    setSelectedTrack(t);

    props.onTrackSelected?.(t);

    void (async () => {
      await addTrackToSelectedPlaylist(t);
      props.onAddHandled?.();
    })();
  }, [props.addNowTrack]);

  return (
    <div className="rounded-2xl bg-white/8 p-3 ring-1 ring-white/10">

      <div className="text-sm font-semibold text-white/90 mb-2">
        PLAYLISTS
      </div>

      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New playlist…"
          className="h-10 w-full rounded-xl bg-white/10 px-3 text-sm text-white placeholder:text-white/40 ring-1 ring-white/10 focus:outline-none"
        />

        <button
          onClick={() => void createPlaylist()}
          disabled={creating || !newName.trim() || !userId}
          className="h-10 rounded-xl bg-gradient-to-r from-purple-500 to-fuchsia-500 px-4 text-sm font-semibold text-white disabled:opacity-40"
        >
          {creating ? "…" : "Create"}
        </button>
      </div>

      <div className="mt-3 text-xs text-white/60">
        Selected track:
      </div>

      <div className="text-sm text-white/90">
        {selectedTrack
          ? `${pickTitle(selectedTrack)} — ${pickArtist(selectedTrack)}`
          : "—"}
      </div>

      <div className="mt-3 flex gap-2">

        <select
          value={selectedPlaylistId}
          onChange={(e) => {
            setSelectedPlaylistId(e.target.value);
            props.onPlaylistSelected?.(e.target.value);
            setNotice("");
          }}
          disabled={loadingPlaylists || playlists.length === 0}
          className="h-10 w-full rounded-xl bg-cyan-500/80 px-3 text-sm text-white ring-1 ring-cyan-400 focus:outline-none"
        >
          {playlists.length === 0 ? (
            <option value="">No playlists</option>
          ) : (
            playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))
          )}
        </select>

        <button
          onClick={() =>
            selectedTrack && void addTrackToSelectedPlaylist(selectedTrack)
          }
          disabled={adding || !selectedTrack || !selectedPlaylistId}
          className="h-10 rounded-xl bg-cyan-500 px-4 text-sm font-semibold text-white disabled:opacity-40"
        >
          {adding ? "…" : "Add"}
        </button>
      </div>

      {notice && (
        <div className="mt-2 text-xs text-white/70">
          {notice}
        </div>
      )}

      {selectedPlaylist && (
        <div className="mt-3 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
          <div className="text-sm font-semibold text-white/90">
            {selectedPlaylist.name}
          </div>
          <div className="text-xs text-white/50">
            Tip: click “Add” on a track to add instantly.
          </div>
        </div>
      )}
    </div>
  );
}