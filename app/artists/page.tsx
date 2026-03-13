"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";

type ArtistRow = {
  id: string;
  display_name: string | null;
  slug: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at?: string | null;
  is_founding: boolean | null;
};

type TrackRow = {
  id: string;
  artist: string | null;
  user_id: string | null;
  plays_this_month: number | null;
};

type TrackLikeMonthlyRow = {
  track_id: string;
  month: string;
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

  const [tracksCountByArtistId, setTracksCountByArtistId] = useState<Record<string, number>>({});
  const [playsMonthByArtistId, setPlaysMonthByArtistId] = useState<Record<string, number>>({});
  const [likesMonthByArtistId, setLikesMonthByArtistId] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      try {
        const { data: artistData, error: artistErr } = await supabase
          .from("profiles")
          .select("id,display_name,slug,bio,avatar_url,created_at,is_founding")
          .eq("role", "artist")
          .order("created_at", { ascending: false });

        if (artistErr) {
          console.error("artists page profiles error:", artistErr);
          if (!cancelled) {
            setArtists([]);
            setTracksCountByArtistId({});
            setPlaysMonthByArtistId({});
            setLikesMonthByArtistId({});
            setLoading(false);
          }
          return;
        }

        if (cancelled) return;

        const artistRows = ((artistData as ArtistRow[]) || []).filter(
          (a) => a?.id && a?.display_name && a?.slug
        );

        setArtists(artistRows);

        const artistIds = artistRows.map((a) => a.id);

        if (!artistIds.length) {
          setTracksCountByArtistId({});
          setPlaysMonthByArtistId({});
          setLikesMonthByArtistId({});
          setLoading(false);
          return;
        }

        const { data: trackData, error: trackErr } = await supabase
          .from("tracks")
          .select("id,artist,user_id,plays_this_month")
          .eq("is_published", true)
          .in("user_id", artistIds);

        if (trackErr) {
          console.error("artists page tracks error:", trackErr);
          if (!cancelled) {
            setTracksCountByArtistId({});
            setPlaysMonthByArtistId({});
            setLikesMonthByArtistId({});
            setLoading(false);
          }
          return;
        }

        if (cancelled) return;

        const tracks = ((trackData as TrackRow[]) || []).filter(Boolean);

        const counts: Record<string, number> = {};
        const playsM: Record<string, number> = {};
        const trackIdToArtistId: Record<string, string> = {};

        for (const tr of tracks) {
          const artistId = tr.user_id || "";
          if (!artistId) continue;

          counts[artistId] = (counts[artistId] || 0) + 1;
          playsM[artistId] = (playsM[artistId] || 0) + (tr.plays_this_month || 0);
          trackIdToArtistId[tr.id] = artistId;
        }

        setTracksCountByArtistId(counts);
        setPlaysMonthByArtistId(playsM);

        const trackIds = tracks.map((t) => t.id);

        if (!trackIds.length) {
          setLikesMonthByArtistId({});
          setLoading(false);
          return;
        }

        const monthStart = monthStartISO(new Date());

        const { data: likeRows, error: likeErr } = await supabase
          .from("track_likes_monthly")
          .select("track_id,month,likes")
          .eq("month", monthStart)
          .in("track_id", trackIds);

        if (likeErr) {
          console.error("artists page likes error:", likeErr);
          if (!cancelled) {
            setLikesMonthByArtistId({});
            setLoading(false);
          }
          return;
        }

        if (cancelled) return;

        const likesByArtistId: Record<string, number> = {};

        for (const row of ((likeRows as TrackLikeMonthlyRow[]) || [])) {
          const artistId = trackIdToArtistId[row.track_id];
          if (!artistId) continue;
          likesByArtistId[artistId] = (likesByArtistId[artistId] || 0) + (row.likes || 0);
        }

        setLikesMonthByArtistId(likesByArtistId);
        setLoading(false);
      } catch (e) {
        console.error("artists page unexpected error:", e);
        if (!cancelled) {
          setArtists([]);
          setTracksCountByArtistId({});
          setPlaysMonthByArtistId({});
          setLikesMonthByArtistId({});
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return artists;

    return artists.filter((a) => {
      const hay = `${a.display_name || ""} ${a.bio || ""} ${a.slug || ""}`.toLowerCase();
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
            <div className="bg-black/20 px-4 py-8 text-sm text-white/70">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="bg-black/20 px-4 py-8 text-sm text-white/70">No artists found.</div>
          ) : (
            filtered.map((a) => {
              const tracksCount = tracksCountByArtistId[a.id] || 0;
              const playsMonth = playsMonthByArtistId[a.id] || 0;
              const likesMonth = likesMonthByArtistId[a.id] || 0;
              const isFounding = Boolean(a.is_founding);

              return (
                <button
                  key={a.id}
                  onClick={() => {
                    if (a.slug) router.push(`/artists/${a.slug}`);
                  }}
                  className="grid w-full grid-cols-[1fr_120px_140px_140px] items-center gap-2 bg-black/20 px-4 py-4 text-left hover:bg-black/30"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {isFounding ? (
                      <div className="rounded-[18px] bg-gradient-to-r from-cyan-400 to-fuchsia-500 p-[2px] shadow-[0_0_18px_rgba(56,189,248,0.18)]">
                        <div className="relative h-11 w-11 flex-none overflow-hidden rounded-[16px] bg-white/5">
                          {a.avatar_url ? (
                            <Image
                              src={a.avatar_url}
                              alt={a.display_name || "Artist"}
                              fill
                              className="object-cover"
                              sizes="44px"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-white/40 text-lg">
                              🎵
                            </div>
                          )}

                          <div className="absolute bottom-1 right-1 rounded-full border border-black/20 bg-black/55 px-1 py-[1px] text-[9px] font-semibold text-cyan-200 backdrop-blur">
                            ★
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="relative h-11 w-11 flex-none overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                        {a.avatar_url ? (
                          <Image
                            src={a.avatar_url}
                            alt={a.display_name || "Artist"}
                            fill
                            className="object-cover"
                            sizes="44px"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-white/40 text-lg">
                            🎵
                          </div>
                        )}
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">
                        {a.display_name || "Unnamed artist"}
                      </div>
                      <div className="truncate text-xs text-white/60">
                        {a.slug || "no-slug"}
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