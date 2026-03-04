"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ArtistPanel from "@/app/components/ArtistPanel";
import { usePlayer, type Track } from "@/app/components/PlayerContext";

type Playlist = {
  id: string;
  user_id: string;
  name: string;
  created_at?: string;
};

type PlaylistTrackRow = {
  id: string;
  playlist_id: string;
  track_id: string;
  position: number | null;
  created_at?: string;
};

function pickTitle(t: Track) {
  return (t.title ?? (t as any).name ?? "Untitled").toString();
}

function pickGenre(t: Track) {
  return (t.genre ?? "-").toString();
}

function isAbsoluteUrl(u: string) {
  return /^https?:\/\//i.test(u);
}

function getArtworkSrc(t: Track) {
  const raw =
    (t as any).artwork_url ||
    (t as any).cover_url ||
    (t as any).image_url ||
    "";

  if (!raw) return "/logo-new.png";
  if (isAbsoluteUrl(raw)) return raw;
  if (raw.startsWith("/")) return raw;

  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${raw}`;
}

const selectClass =
  "h-9 min-w-[180px] rounded-xl px-3 text-sm text-white ring-1 ring-white/10 " +
  "bg-gradient-to-r from-teal-500/20 via-sky-500/15 to-fuchsia-500/20 " +
  "backdrop-blur hover:ring-white/20 focus:outline-none";

const inputClass =
  "h-9 w-full rounded-xl px-3 text-sm text-white placeholder:text-white/40 ring-1 ring-white/10 " +
  "bg-gradient-to-r from-teal-500/20 via-sky-500/15 to-fuchsia-500/20 " +
  "backdrop-blur hover:ring-white/20 focus:outline-none md:w-[200px]";

const btnGradient =
  "h-9 rounded-xl px-4 text-sm font-medium text-white ring-1 ring-white/15 " +
  "bg-gradient-to-r from-teal-500/70 to-fuchsia-500/70 hover:from-teal-500/85 hover:to-fuchsia-500/85 " +
  "disabled:opacity-60";

const btnGlass =
  "h-9 rounded-xl px-4 text-sm font-medium text-white ring-1 ring-white/12 " +
  "bg-white/10 hover:bg-white/15 disabled:opacity-60";

export default function DiscoverPage() {
  const { playTrack, toggle, isPlaying, currentTrack } = usePlayer();

  const [tracks, setTracks] = useState<Track[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(true);

  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [user, setUser] = useState<any>(null);

  // Playlists
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);

  // View mode (filter)
  const [viewPlaylistId, setViewPlaylistId] = useState<string>(""); // "" = all tracks
  const [playlistViewTracks, setPlaylistViewTracks] = useState<Track[]>([]);
  const [loadingPlaylistView, setLoadingPlaylistView] = useState(false);

  // Add target
  const [addToPlaylistId, setAddToPlaylistId] = useState<string>("");

  // Create playlist
  const [newPlaylistName, setNewPlaylistName] = useState<string>("");
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);

  const nowPlayingId = currentTrack?.id ?? null;

  // ✅ Fetch logged in user
  useEffect(() => {
    const getUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error("Failed to get user:", error, JSON.stringify(error));
        setUser(null);
        return;
      }
      setUser(data.user ?? null);
    };
    getUser();
  }, []);

  // ✅ Fetch tracks (all)
  useEffect(() => {
    const fetchTracks = async () => {
      setLoadingTracks(true);

      const { data, error } = await supabase
        .from("tracks")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to load tracks:", error, JSON.stringify(error));
        setTracks([]);
      } else {
        setTracks((data ?? []) as any);
      }

      setLoadingTracks(false);
    };

    fetchTracks();
  }, []);

  // ✅ Fetch playlists (for this user)
  const refreshPlaylists = async (userId: string) => {
    setLoadingPlaylists(true);

    const { data, error } = await supabase
      .from("playlists")
      .select("id, user_id, name, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load playlists:", error, JSON.stringify(error));
      setPlaylists([]);
      setAddToPlaylistId("");
      setViewPlaylistId("");
      setLoadingPlaylists(false);
      return;
    }

    const list = (data ?? []) as Playlist[];
    setPlaylists(list);

    if (!addToPlaylistId && list.length > 0) {
      setAddToPlaylistId(list[0].id);
    }

    setLoadingPlaylists(false);
  };

  useEffect(() => {
    if (!user?.id) return;
    refreshPlaylists(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ✅ Load playlist tracks for VIEW mode
  const loadPlaylistForView = async (playlistId: string) => {
    if (!playlistId) {
      setPlaylistViewTracks([]);
      return;
    }

    setLoadingPlaylistView(true);

    const { data: ptData, error: ptErr } = await supabase
      .from("playlist_tracks")
      .select("id, playlist_id, track_id, position")
      .eq("playlist_id", playlistId)
      .order("position", { ascending: true, nullsFirst: false });

    if (ptErr) {
      console.error("Failed to load playlist_tracks:", ptErr, JSON.stringify(ptErr));
      setPlaylistViewTracks([]);
      setLoadingPlaylistView(false);
      return;
    }

    if (!ptData || ptData.length === 0) {
      setPlaylistViewTracks([]);
      setLoadingPlaylistView(false);
      return;
    }

    const rows = ptData as PlaylistTrackRow[];
    const trackIds = rows.map((r) => r.track_id).filter(Boolean);

    const { data: trackData, error: trackErr } = await supabase
      .from("tracks")
      .select("*")
      .in("id", trackIds);

    if (trackErr) {
      console.error("Failed to load tracks for playlist:", trackErr, JSON.stringify(trackErr));
      setPlaylistViewTracks([]);
      setLoadingPlaylistView(false);
      return;
    }

    const list = ((trackData ?? []) as any) as Track[];

    const byId = new Map<string, Track>();
    for (const t of list) byId.set(String((t as any).id), t);

    const ordered = rows
      .slice()
      .sort((a, b) => {
        const pa = a.position ?? 10_000_000;
        const pb = b.position ?? 10_000_000;
        return pa - pb;
      })
      .map((r) => byId.get(String(r.track_id)) ?? null)
      .filter(Boolean) as Track[];

    setPlaylistViewTracks(ordered);
    setLoadingPlaylistView(false);
  };

  useEffect(() => {
    if (!viewPlaylistId) {
      setPlaylistViewTracks([]);
      return;
    }
    loadPlaylistForView(viewPlaylistId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewPlaylistId]);

  const displayedTracks = useMemo(() => {
    if (!viewPlaylistId) return tracks;
    return playlistViewTracks;
  }, [tracks, viewPlaylistId, playlistViewTracks]);

  // ✅ Create playlist
  const createPlaylist = async () => {
    if (!user?.id) {
      alert("Please log in first.");
      return;
    }

    const name = newPlaylistName.trim();
    if (!name) {
      alert("Enter playlist name.");
      return;
    }

    setCreatingPlaylist(true);

    const { data, error } = await supabase
      .from("playlists")
      .insert([{ user_id: user.id, name }])
      .select("id, user_id, name, created_at")
      .single();

    if (error) {
      console.error("Create playlist failed:", error, JSON.stringify(error));
      alert("Create playlist failed. Check console.");
      setCreatingPlaylist(false);
      return;
    }

    await refreshPlaylists(user.id);

    if (data?.id) {
      setAddToPlaylistId(data.id);
      setViewPlaylistId(data.id);
    }

    setNewPlaylistName("");
    setCreatingPlaylist(false);
  };

  // ✅ Add track to selected playlist
  const addTrackToPlaylist = async (track: Track) => {
    if (!user?.id) {
      alert("Please log in first.");
      return;
    }
    if (!addToPlaylistId) {
      alert("Choose playlist in 'Add to:' first.");
      return;
    }

    const trackId = String((track as any).id);

    const { data: existsRow, error: existsErr } = await supabase
      .from("playlist_tracks")
      .select("id")
      .eq("playlist_id", addToPlaylistId)
      .eq("track_id", trackId)
      .maybeSingle();

    if (existsErr) {
      console.error("Failed to check existing playlist track:", existsErr, JSON.stringify(existsErr));
      alert("Add failed. Check console.");
      return;
    }

    if (existsRow?.id) {
      alert("This track is already in that playlist.");
      return;
    }

    const { data: lastRow, error: lastErr } = await supabase
      .from("playlist_tracks")
      .select("position")
      .eq("playlist_id", addToPlaylistId)
      .order("position", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (lastErr) {
      console.error("Failed to read last position:", lastErr, JSON.stringify(lastErr));
      alert("Add failed. Check console.");
      return;
    }

    const nextPos = (Number(lastRow?.position ?? 0) || 0) + 1;

    const { error: insErr } = await supabase.from("playlist_tracks").insert([
      {
        playlist_id: addToPlaylistId,
        track_id: trackId,
        position: nextPos,
      },
    ]);

    if (insErr) {
      console.error("Failed to insert playlist_tracks:", insErr, JSON.stringify(insErr));
      alert("Add failed. Check console.");
      return;
    }

    if (viewPlaylistId && viewPlaylistId === addToPlaylistId) {
      await loadPlaylistForView(viewPlaylistId);
    }
  };

  // ✅ Stripe upgrade (2-tier, monthly only)
  const upgrade = async (plan: "premium" | "artist_pro") => {
    if (!user) {
      alert("Please log in first.");
      return;
    }

    try {
      const res = await fetch("/api/stripe/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: plan,
          email: user.email || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Checkout failed");
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
      } else {
        console.error("No checkout URL returned", data);
        alert("No checkout URL returned");
      }
    } catch (err) {
      console.error("Upgrade error:", err);
      alert("Checkout failed");
    }
  };

  if (loadingTracks) {
    return <div className="p-6 text-white/70">Loading tracks...</div>;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-4 pb-24">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {/* LEFT SIDE */}
        <div className="space-y-4 md:col-span-2">
          {/* Playlist controls */}
          <div className="rounded-2xl bg-white/8 p-3 ring-1 ring-white/10">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              {/* View filter */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-medium text-white/80">View:</div>
                <select
                  className={selectClass}
                  value={viewPlaylistId}
                  onChange={(e) => setViewPlaylistId(e.target.value)}
                >
                  <option value="">All tracks</option>
                  {playlists.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>

                {loadingPlaylistView ? (
                  <div className="text-xs text-white/50">Loading…</div>
                ) : null}
              </div>

              {/* Add target + create */}
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-medium text-white/80">Add to:</div>
                  <select
                    className={selectClass}
                    value={addToPlaylistId}
                    onChange={(e) => setAddToPlaylistId(e.target.value)}
                    disabled={loadingPlaylists}
                  >
                    <option value="">Select playlist…</option>
                    {playlists.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    placeholder="New playlist…"
                    className={inputClass}
                  />
                  <button
                    onClick={createPlaylist}
                    disabled={creatingPlaylist}
                    className={btnGradient}
                  >
                    {creatingPlaylist ? "Creating…" : "Create"}
                  </button>
                </div>
              </div>
            </div>

            {!user ? (
              <div className="mt-2 text-xs text-white/50">
                (Playlists work only when logged in.)
              </div>
            ) : null}
          </div>

          {/* Track list */}
          {displayedTracks.length === 0 ? (
            <div className="rounded-2xl bg-white/8 p-5 text-white/70 ring-1 ring-white/10">
              {viewPlaylistId ? "This playlist is empty." : "No tracks found."}
            </div>
          ) : (
            displayedTracks.map((t) => {
              const id = String((t as any).id);
              const isCurrent = nowPlayingId != null && String(nowPlayingId) === id;

              return (
                <div
                  key={id}
                  className="flex items-center justify-between rounded-2xl bg-white/8 p-3 ring-1 ring-white/10"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={getArtworkSrc(t)}
                      alt={pickTitle(t)}
                      className="h-12 w-12 rounded-xl object-cover ring-1 ring-white/10"
                    />

                    <div className="leading-tight">
                      <div className="text-[15px] font-semibold text-white">
                        {pickTitle(t)}
                      </div>
                      <div className="text-xs text-white/60">
                        {(t.artist ?? "AI Artist") + " • " + pickGenre(t)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button onClick={() => addTrackToPlaylist(t)} className={btnGlass}>
                      Add
                    </button>

                    <button
                      onClick={() => {
                        setSelectedTrack(t);

                        if (isCurrent) {
                          void toggle();
                          return;
                        }

                        void playTrack(t, displayedTracks);
                      }}
                      className={btnGradient}
                    >
                      {isCurrent && isPlaying ? "Pause" : "Play"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* RIGHT SIDE - Artist Panel */}
        <div className="rounded-2xl bg-white/8 p-3 ring-1 ring-white/10">
          <ArtistPanel
            artistName={(selectedTrack?.artist ?? "AI Artist").toString()}
            genre={selectedTrack ? pickGenre(selectedTrack) : "-"}
            selectedTitle={selectedTrack ? pickTitle(selectedTrack) : "No track selected"}
            artworkSrc={selectedTrack ? getArtworkSrc(selectedTrack) : "/logo-new.png"}
            tracks={displayedTracks}
            onSelectTrack={(t) => {
              setSelectedTrack(t);
              void playTrack(t, displayedTracks);
            }}
            onPlayClick={(t) => {
              setSelectedTrack(t);
              void playTrack(t, displayedTracks);
            }}
            isPlaying={isPlaying}
            currentTrackId={nowPlayingId}
            selectedTrack={selectedTrack}
            onUpgradePlan={upgrade}
          />
        </div>
      </div>
    </div>
  );
}