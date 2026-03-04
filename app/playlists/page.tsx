"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { usePlayer, type Track } from "@/app/components/PlayerContext";

type Playlist = {
  id: string;
  name: string;
  created_at: string;
  user_id: string;
};

type PlaylistTrackRow = {
  id: string;
  track_id: string;
  added_at: string;
  position: number | null;
  tracks: Track | null;
};

function pickTitle(t: Track) {
  return (t.title ?? t.name ?? "Untitled").toString();
}

function pickGenre(t: Track) {
  return (t.genre ?? "-").toString();
}

export default function PlaylistsPage() {
  const { playTrack } = usePlayer();

  const [user, setUser] = useState<any>(null);

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>("");

  const [items, setItems] = useState<PlaylistTrackRow[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  const [removingId, setRemovingId] = useState<string>("");

  // ✅ Load user
  useEffect(() => {
    const run = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error("getUser failed:", error, JSON.stringify(error));
        setUser(null);
        return;
      }
      setUser(data.user ?? null);
    };
    run();
  }, []);

  const fetchPlaylists = async (userId: string) => {
    setLoadingPlaylists(true);

    const { data, error } = await supabase
      .from("playlists")
      .select("id, name, created_at, user_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load playlists:", error, JSON.stringify(error));
      setPlaylists([]);
      setSelectedPlaylistId("");
      setLoadingPlaylists(false);
      return;
    }

    const list = (data ?? []) as Playlist[];
    setPlaylists(list);

    // keep selection if still exists; else pick first
    setSelectedPlaylistId((prev) => {
      if (prev && list.some((p) => p.id === prev)) return prev;
      return list[0]?.id ?? "";
    });

    setLoadingPlaylists(false);
  };

  const fetchItems = async (playlistId: string) => {
    if (!playlistId) {
      setItems([]);
      return;
    }

    setLoadingItems(true);

    // NOTE: expects FK relationship playlist_tracks.track_id -> tracks.id
    const { data, error } = await supabase
      .from("playlist_tracks")
      .select("id, track_id, added_at, position, tracks (*)")
      .eq("playlist_id", playlistId)
      .order("position", { ascending: true, nullsFirst: false });

    if (error) {
      console.error("Failed to load playlist items:", error, JSON.stringify(error));
      setItems([]);
      setLoadingItems(false);
      return;
    }

    setItems((data ?? []) as any);
    setLoadingItems(false);
  };

  useEffect(() => {
    if (!user?.id) return;
    fetchPlaylists(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!selectedPlaylistId) {
      setItems([]);
      return;
    }
    fetchItems(selectedPlaylistId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlaylistId]);

  const tracksOnly = useMemo(() => {
    return items.map((it) => it.tracks).filter(Boolean) as Track[];
  }, [items]);

  const saveNewOrder = async (updated: PlaylistTrackRow[]) => {
    setSavingOrder(true);

    // Normalize positions to 1..N
    const updates = updated.map((item, index) => ({
      id: item.id,
      position: index + 1,
    }));

    const results = await Promise.all(
      updates.map((u) =>
        supabase.from("playlist_tracks").update({ position: u.position }).eq("id", u.id)
      )
    );

    const firstErr = results.find((r) => r.error)?.error;
    if (firstErr) {
      console.error("Failed to save new order:", firstErr, JSON.stringify(firstErr));
      // if save fails, reload from DB to avoid UI lying
      await fetchItems(selectedPlaylistId);
    }

    setSavingOrder(false);
  };

  const handleDrop = async (dropIndex: number) => {
    if (dragIndex === null) return;
    if (dropIndex === dragIndex) {
      setDragIndex(null);
      return;
    }

    const updated = [...items];
    const [moved] = updated.splice(dragIndex, 1);
    updated.splice(dropIndex, 0, moved);

    // optimistic UI
    setItems(updated);
    setDragIndex(null);

    await saveNewOrder(updated);
  };

  const removeFromPlaylist = async (playlistTrackId: string) => {
    if (!selectedPlaylistId) return;

    setRemovingId(playlistTrackId);

    const { error } = await supabase
      .from("playlist_tracks")
      .delete()
      .eq("id", playlistTrackId);

    if (error) {
      console.error("Remove failed:", error, JSON.stringify(error));
      alert("Remove failed. Check console.");
      setRemovingId("");
      return;
    }

    await fetchItems(selectedPlaylistId);
    setRemovingId("");
  };

  if (!user) {
    return <div className="p-6 text-white/70">Log in to use playlists.</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-4 text-2xl font-semibold text-white">Playlists</div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Playlist list */}
        <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
          {loadingPlaylists ? (
            <div className="text-sm text-white/60">Loading playlists…</div>
          ) : playlists.length === 0 ? (
            <div className="text-sm text-white/60">No playlists yet.</div>
          ) : (
            playlists.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPlaylistId(p.id)}
                className={`mb-2 w-full rounded-xl p-2 text-left ring-1 ring-white/10 ${
                  selectedPlaylistId === p.id
                    ? "bg-white/20 text-white"
                    : "bg-white/10 text-white/80 hover:bg-white/15"
                }`}
              >
                {p.name}
              </button>
            ))
          )}
        </div>

        {/* Tracks */}
        <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 md:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={() => {
                if (!tracksOnly.length) return;
                void playTrack(tracksOnly[0], tracksOnly);
              }}
              className="rounded-xl bg-white/15 px-4 py-2 text-white ring-1 ring-white/15 hover:bg-white/25 disabled:opacity-60"
              disabled={!tracksOnly.length}
            >
              Play
            </button>

            <div className="text-sm text-white/60">
              {savingOrder ? "Saving order…" : null}
            </div>
          </div>

          {loadingItems ? (
            <div className="text-sm text-white/60">Loading tracks…</div>
          ) : items.length === 0 ? (
            <div className="rounded-xl bg-white/5 p-4 text-sm text-white/60 ring-1 ring-white/10">
              This playlist is empty.
            </div>
          ) : (
            items.map((row, index) => {
              const t = row.tracks;
              if (!t) return null;

              const isRemoving = removingId === row.id;

              return (
                <div
                  key={row.id}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragEnd={() => setDragIndex(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => void handleDrop(index)}
                  className="mb-2 flex cursor-move items-center justify-between rounded-xl bg-white/10 p-3 ring-1 ring-white/10"
                  title="Drag to reorder"
                >
                  <div>
                    <div className="text-white">{pickTitle(t)}</div>
                    <div className="text-xs text-white/60">
                      {t.artist ?? "AI Artist"} • {pickGenre(t)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void playTrack(t, tracksOnly)}
                      className="rounded-lg bg-white/15 px-3 py-2 text-white ring-1 ring-white/15 hover:bg-white/25"
                    >
                      Play
                    </button>

                    <button
                      onClick={() => void removeFromPlaylist(row.id)}
                      disabled={isRemoving}
                      className="rounded-lg bg-white/10 px-3 py-2 text-white/90 ring-1 ring-white/10 hover:bg-white/15 disabled:opacity-60"
                      aria-label="Remove from playlist"
                      title="Remove"
                    >
                      {isRemoving ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}