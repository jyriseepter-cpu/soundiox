"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";

type ArtistRow = {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  avatar_url: string | null;
  genre: string | null;
  donate_enabled: boolean | null;
  created_at?: string | null;
};

type TrackRow = {
  id: string;
  artist: string;
  plays_this_month: number | null;
};

type TrackLikeMonthlyRow = {
  track_id: string;
  month: string; // yyyy-mm-dd
  likes: number;
};

function monthStartISO(d = new Date()) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  const yyyy = x.getFullYear();
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

export default function ArtistsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [artists, setArtists] = useState<ArtistRow[]>([]);
  const [search, setSearch] = useState("");

  // computed stats
  const [tracksCountByArtist, setTracksCountByArtist] = useState<Record<string, number>>({});
  const [playsMonthByArtist, setPlaysMonthByArtist] = useState<Record<string, number>>({});
  const [likesMonthByArtist, setLikesMonthByArtist] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      // 1) Artists
      const { data: artistData, error: artistErr } = await supabase
        .from("artists")
        .select("id,name,slug,bio,avatar_url,genre,donate_enabled,created_at")
        .order("created_at", { ascending: false });

      if (artistErr) console.error(artistErr);
      if (cancelled) return;

      const a = ((artistData as ArtistRow[]) || []).filter(Boolean);
      setArtists(a);

      // 2) Tracks (for counts + plays_this_month)
      const { data: trackData, error: trackErr } = await supabase
        .from("tracks")
        .select("id,artist,plays_this_month")
        .eq("is_published", true);

      if (trackErr) console.error(trackErr);
      if (cancelled) return;

      const t = ((trackData as TrackRow[]) || []).filter(Boolean);

      const counts: Record<string, number> = {};
      const playsM: Record<string, number> = {};
      const trackIdToArtist: Record<string, string> = {};

      for (const tr of t) {
        const name = tr.artist || "";
        if (!name) continue;
        counts[name] = (counts[name] || 0) + 1;
        playsM[name] = (playsM[name] || 0) + (tr.plays_this_month || 0);
        trackIdToArtist[tr.id] = name;
      }

      setTracksCountByArtist(counts);
      setPlaysMonthByArtist(playsM);

      // 3) Likes this month (sum by artist via track ids)
      const trackIds = t.map((x) => x.id);
      if (!trackIds.length) {
        setLikesMonthByArtist({});
        setLoading(false);
        return;
      }

      const monthStart = monthStartISO(new Date());
      const { data: likeRows, error: likeErr } = await supabase
        .from("track_likes_monthly")
        .select("track_id,month,likes")
        .eq("month", monthStart)
        .in("track_id", trackIds);

      if (likeErr) console.error(likeErr);
      if (cancelled) return;

      const likesByArtist: Record<string, number> = {};
      for (const r of ((likeRows as TrackLikeMonthlyRow[]) || [])) {
        const artistName = trackIdToArtist[r.track_id];
        if (!artistName) continue;
        likesByArtist[artistName] = (likesByArtist[artistName] || 0) + (r.likes || 0);
      }
      setLikesMonthByArtist(likesByArtist);

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return artists;
    return artists.filter((a) => {
      const hay = `${a.name} ${a.genre || ""} ${a.bio || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [artists, search]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-8">
      <h1 className="text-3xl font-semibold text-white">Artists</h1>
      <p className="mt-1 text-sm text-white/70">AI artists on SoundioX.</p>

      <div className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search artist..."
          className="h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/20"
        />

        <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
          <div className="grid grid-cols-[1fr_120px_140px_140px] gap-2 bg-black/30 px-4 py-3 text-xs font-semibold text-white/60">
            <div>ARTIST</div>
            <div className="text-right">TRACKS</div>
            <div className="text-right">PLAYS (MONTH)</div>
            <div className="text-right">LIKES (MONTH)</div>
          </div>

          {loading ? (
            <div className="bg-black/20 px-4 py-8 text-sm text-white/70">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="bg-black/20 px-4 py-8 text-sm text-white/70">No artists found.</div>
          ) : (
            filtered.map((a) => {
              const tracksCount = tracksCountByArtist[a.name] || 0;
              const playsMonth = playsMonthByArtist[a.name] || 0;
              const likesMonth = likesMonthByArtist[a.name] || 0;

              return (
                <button
                  key={a.id}
                  onClick={() => router.push(`/artists/${a.slug}`)} // ✅ alati slug
                  className="grid w-full grid-cols-[1fr_120px_140px_140px] items-center gap-2 bg-black/20 px-4 py-4 text-left hover:bg-black/30"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="relative h-11 w-11 flex-none overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                      {a.avatar_url ? (
                        <Image
                          src={a.avatar_url}
                          alt={a.name}
                          fill
                          className="object-cover"
                          sizes="44px"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{a.name}</div>
                      <div className="truncate text-xs text-white/60">
                        {a.genre || "—"} • Bio ✓
                      </div>
                    </div>
                  </div>

                  <div className="text-right text-sm font-semibold text-white">{tracksCount}</div>
                  <div className="text-right text-sm font-semibold text-white">{playsMonth}</div>
                  <div className="text-right text-sm font-semibold text-white">{likesMonth}</div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}