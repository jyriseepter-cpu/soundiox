"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ArtistPanel from "@/app/components/ArtistPanel";
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
  plays_this_month: number | null;
  is_published: boolean | null;
};

function pickTitle(t: TrackRow) {
  return (t.title ?? "Untitled").toString();
}

function pickArtist(t: TrackRow) {
  return (t.artist ?? "AI Artist").toString();
}

function pickGenre(t: TrackRow) {
  return (t.genre ?? "-").toString();
}

function getArtworkSrc(t: TrackRow) {
  return (t.artwork_url ?? "/logo-new.png").toString();
}

export default function DiscoverPage() {
  const { playTrack, currentTrack, isPlaying } = usePlayer();

  const [tracks, setTracks] = useState<TrackRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("All genres");

  const [selectedTrack, setSelectedTrack] = useState<TrackRow | null>(null);

  const nowPlayingId = (currentTrack as any)?.id ?? null;

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);

        const { data, error } = await supabase
          .from("tracks")
          .select(
            "id,title,artist,genre,audio_url,artwork_url,created_at,plays_all_time,plays_this_month,is_published"
          )
          .eq("is_published", true)
          .order("created_at", { ascending: false });

        if (error) throw error;

        const list = (data ?? []) as TrackRow[];
        if (!alive) return;

        setTracks(list);
        if (!selectedTrack && list.length > 0) setSelectedTrack(list[0]);
      } catch (e: any) {
        console.error("discover fetch tracks error:", e, {
          message: e?.message,
          details: e?.details,
          hint: e?.hint,
          code: e?.code,
        });
        if (!alive) return;
        setTracks([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const genreOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of tracks) {
      const g = (t.genre ?? "").trim();
      if (g) set.add(g);
    }
    return ["All genres", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [tracks]);

  const displayedTracks = useMemo(() => {
    const q = search.trim().toLowerCase();

    return tracks.filter((t) => {
      if (genre !== "All genres" && (t.genre ?? "") !== genre) return false;

      if (!q) return true;

      const hay = `${t.title ?? ""} ${t.artist ?? ""} ${t.genre ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [tracks, search, genre]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <input
          className="h-10 w-full rounded-xl bg-white/10 px-4 text-white placeholder-white/50 ring-1 ring-white/10 outline-none focus:ring-white/20 md:max-w-[520px]"
          placeholder="Search tracks, artists, genres..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="h-10 w-full min-w-[160px] rounded-xl bg-white/10 px-3 text-white ring-1 ring-white/10 outline-none focus:ring-white/20 md:w-auto"
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
        >
          {genreOptions.map((g) => (
            <option key={g} value={g} className="bg-[#0b0f1a]">
              {g}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* LEFT: tracks list */}
        <div className="rounded-2xl bg-white/6 p-3 ring-1 ring-white/10">
          <div className="mb-2 flex items-center justify-between px-2">
            <div className="text-white/90 font-semibold">Discover</div>
            <div className="text-white/50 text-sm">
              {loading ? "Loading..." : `${displayedTracks.length} tracks`}
            </div>
          </div>

          <div className="space-y-2">
            {loading ? (
              <div className="px-2 py-6 text-white/60">Loading tracks…</div>
            ) : displayedTracks.length === 0 ? (
              <div className="px-2 py-6 text-white/60">No tracks found.</div>
            ) : (
              displayedTracks.map((t) => (
               <TrackCard
  key={t.id}
  track={t as any}
  allTracks={displayedTracks as any}
  onPlay={() => {
    setSelectedTrack(t);
    void playTrack(t as any, displayedTracks as any);
  }}
/>
              ))
            )}
          </div>
        </div>

        {/* RIGHT: Artist panel (includes playlists UI inside it in your current setup) */}
        <div className="rounded-2xl bg-white/8 p-3 ring-1 ring-white/10">
          <ArtistPanel
            artistName={pickArtist(selectedTrack ?? ({} as any))}
            genre={selectedTrack ? pickGenre(selectedTrack) : "-"}
            selectedTitle={selectedTrack ? pickTitle(selectedTrack) : "No track selected"}
            artworkSrc={selectedTrack ? getArtworkSrc(selectedTrack) : "/logo-new.png"}
            tracks={displayedTracks as any}
            onSelectTrack={(t: any) => {
              setSelectedTrack(t);
              void playTrack(t, displayedTracks as any);
            }}
            onPlayClick={(t: any) => {
              setSelectedTrack(t);
              void playTrack(t, displayedTracks as any);
            }}
            isPlaying={isPlaying}
            currentTrackId={nowPlayingId}
            selectedTrack={selectedTrack as any}
            onUpgradePlan={async (plan: any) => {
  console.log("upgrade plan:", plan);
  return;
}}
          />
        </div>
      </div>
    </div>
  );
}