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
  // track, millele vajutati "Add" (Discover listist või mujalt)
  addNowTrack?: Track | null;
  // parent annab signaali, et addNowTrack sai ära käsitletud
  onAddHandled?: () => void;

  // kui parent tahab teada, milline playlist valitud (optional)
  onPlaylistSelected?: (playlistId: string) => void;

  // kui parent tahab track selectionit näha (optional)
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

  // --- init user ---
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

  // --- fetch playlists when userId changes ---
  useEffect(() => {
    if (!userId) {
      setPlaylists([]);
      setSelectedPlaylistId("");
      return;
    }
    void fetchPlaylists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function fetchPlaylists() {
    if (!userId) return;

    try {
      setLoadingPlaylists(true);
      setNotice("");

      const { data, error } = await supabase
        .from("playlists")
        .select("id,user_id,name,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("fetchPlaylists warning:", error);
        setPlaylists([]);
        setSelectedPlaylistId("");
        return;
      }

      const list = (data ?? []) as Playlist[];
      setPlaylists(list);

      // auto-select first if none selected
      if (!selectedPlaylistId && list.length > 0) {
        const firstId = list[0].id;
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
      setNotice("");

      const { data, error } = await supabase
        .from("playlists")
        .insert({ user_id: userId, name })
        .select("id,user_id,name,created_at")
        .single();

      if (error) throw error;

      setNewName("");

      // prepend
      const created = data as Playlist;
      setPlaylists((prev) => [created, ...prev]);

      // select it
      setSelectedPlaylistId(created.id);
      props.onPlaylistSelected?.(created.id);
    } catch (e: any) {
      console.error("createPlaylist error:", e);
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
      setNotice("");

      const trackId = (track as any).id as string | undefined;
      if (!trackId) {
        setNotice("This track has no id.");
        return;
      }

      // 1) check duplicate (safe, works without relying on DB constraints)
      const { data: exists, error: existsErr } = await supabase
        .from("playlist_tracks")
        .select("id")
        .eq("playlist_id", selectedPlaylistId)
        .eq("track_id", trackId)
        .maybeSingle();

      if (existsErr && existsErr.code !== "PGRST116") {
        // PGRST116 = no rows found in some setups; ignore
        throw existsErr;
      }

      if (exists?.id) {
        setNotice("This track is already in that playlist.");
        return;
      }

      // 2) insert
      const { error } = await supabase.from("playlist_tracks").insert({
        playlist_id: selectedPlaylistId,
        track_id: trackId,
      });

      if (error) throw error;

      setNotice("Added ✅");
      setTimeout(() => setNotice(""), 1200);
    } catch (e: any) {
      console.error("addTrackToSelectedPlaylist error:", e);
      setNotice("Could not add track.");
    } finally {
      setAdding(false);
    }
  }

  // --- auto-add when parent sends addNowTrack ---
  useEffect(() => {
    const t = props.addNowTrack ?? null;
    if (!t) return;

    // always set selection so UI reflects it
    setSelectedTrack(t);
    props.onTrackSelected?.(t);

    // try add immediately (if playlist selected)
    void (async () => {
      await addTrackToSelectedPlaylist(t);
      props.onAddHandled?.();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.addNowTrack]);

  return (
    <div className="rounded-2xl bg-white/8 p-3 ring-1 ring-white/10">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-white/90">PLAYLISTS</div>
      </div>

      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New playlist…"
          className="h-10 w-full rounded-xl bg-white/10 px-3 text-sm text-white placeholder:text-white/40 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
        />
        <button
          onClick={() => void createPlaylist()}
          disabled={creating || !newName.trim() || !userId}
          className="h-10 rounded-xl bg-gradient-to-r from-emerald-400/80 to-fuchsia-500/80 px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
        >
          {creating ? "…" : "Create"}
        </button>
      </div>

      <div className="mt-3">
        <div className="text-xs text-white/60">Selected track:</div>
        <div className="text-sm text-white/90">
          {selectedTrack ? `${pickTitle(selectedTrack)} — ${pickArtist(selectedTrack)}` : "—"}
        </div>
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
          className="h-10 w-full rounded-xl bg-white/10 px-3 text-sm text-white ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
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
          onClick={() => selectedTrack && void addTrackToSelectedPlaylist(selectedTrack)}
          disabled={adding || !selectedTrack || !selectedPlaylistId}
          className="h-10 rounded-xl bg-white/10 px-4 text-sm font-semibold text-white ring-1 ring-white/10 disabled:opacity-40"
        >
          {adding ? "…" : "Add"}
        </button>
      </div>

      {notice ? (
        <div className="mt-2 text-xs text-white/70">
          {notice}
        </div>
      ) : null}

      {selectedPlaylist ? (
        <div className="mt-3 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
          <div className="text-sm font-semibold text-white/90">{selectedPlaylist.name}</div>
          <div className="text-xs text-white/50">Tip: click “Add” on a track to add instantly.</div>
        </div>
      ) : null}
    </div>
  );
}