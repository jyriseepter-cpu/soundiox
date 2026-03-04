"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { usePlayer } from "@/app/components/PlayerContext";

type SortKey = "plays_month" | "likes_month";
type CategoryKey = "global" | "new_rising" | "estonia";

function monthStartISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function safeStr(v: any) {
  return (v ?? "").toString();
}

function isAbsoluteUrl(u: string) {
  return /^https?:\/\//i.test(u);
}

function getArtworkSrc(t: any) {
  const raw =
    t.artwork_url ||
    t.cover_url ||
    t.image_url ||
    t.artwork ||
    t.cover ||
    t.image ||
    "";
  if (!raw) return "/logo-new.png";
  const s = safeStr(raw).trim();
  if (!s) return "/logo-new.png";
  if (isAbsoluteUrl(s)) return s;
  if (s.startsWith("/")) return s; // you already store /art/xxx.jpg
  // fallback: storage relative path
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${s}`;
}

export default function PulsePage() {
  const router = useRouter();
  const { playTrack, currentTrack, isPlaying } = usePlayer();

  const [tracks, setTracks] = useState<any[]>([]);
  const [likesMonth, setLikesMonth] = useState<Map<string, number>>(new Map());
  const [likedSet, setLikedSet] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);

  const [sort, setSort] = useState<SortKey>("plays_month");
  const [category, setCategory] = useState<CategoryKey>("global");
  const [genre, setGenre] = useState<string>("All genres");
  const [q, setQ] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const month = useMemo(() => monthStartISO(), []);

  // auth
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  // load
  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const { data: tRows, error: tErr } = await supabase
        .from("tracks")
        .select("*")
        .eq("is_published", true);

      if (tErr) console.error("Pulse tracks error:", tErr);

      const safe = tRows ?? [];
      setTracks(safe);

      const ids = safe.map((t: any) => t.id).filter(Boolean);

      // month likes
      if (ids.length > 0) {
        const { data: lRows, error: lErr } = await supabase
          .from("track_likes_monthly")
          .select("track_id, month, likes")
          .eq("month", month)
          .in("track_id", ids);

        if (lErr) console.warn("Pulse likes view error:", lErr);

        const map = new Map<string, number>();
        (lRows ?? []).forEach((r: any) =>
          map.set(String(r.track_id), Number(r.likes ?? 0) || 0)
        );
        setLikesMonth(map);
      } else {
        setLikesMonth(new Map());
      }

      // user liked this month
      if (userId && ids.length > 0) {
        const { data: myLikes, error: myErr } = await supabase
          .from("likes")
          .select("track_id")
          .eq("user_id", userId)
          .eq("month", month)
          .in("track_id", ids);

        if (myErr) console.warn("Pulse my likes error:", myErr);

        const set = new Set<string>();
        (myLikes ?? []).forEach((r: any) => set.add(String(r.track_id)));
        setLikedSet(set);
      } else {
        setLikedSet(new Set());
      }

      setLoading(false);
    };

    load();
  }, [userId, month]);

  const rewardPool = useMemo(() => {
    let sum = 0;
    likesMonth.forEach((v) => (sum += v));
    return sum;
  }, [likesMonth]);

  const availableGenres = useMemo(() => {
    const set = new Set<string>();
    for (const t of tracks) {
      const g = safeStr(t.genre).trim();
      if (g) set.add(g);
    }
    return ["All genres", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [tracks]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();

    return tracks.filter((t: any) => {
      // category currently UI-only
      if (category === "new_rising") {
        const created = t.created_at ? new Date(t.created_at).getTime() : 0;
        const days30 = 30 * 24 * 60 * 60 * 1000;
        if (!created || Date.now() - created > days30) return false;
      }

      if (genre !== "All genres") {
        if (safeStr(t.genre) !== genre) return false;
      }

      if (!s) return true;

      const hay = `${safeStr(t.title)} ${safeStr(t.artist)} ${safeStr(t.genre)}`.toLowerCase();
      return hay.includes(s);
    });
  }, [tracks, q, genre, category]);

  const rows = useMemo(() => {
    const list = [...filtered];

    list.sort((a: any, b: any) => {
      const aLikes = likesMonth.get(String(a.id)) ?? 0;
      const bLikes = likesMonth.get(String(b.id)) ?? 0;

      if (sort === "likes_month") return bLikes - aLikes;

      return (Number(b.plays_this_month ?? 0) || 0) - (Number(a.plays_this_month ?? 0) || 0);
    });

    return list;
  }, [filtered, likesMonth, sort]);

  const toggleLike = async (trackId: string) => {
    if (!userId) {
      router.push("/login");
      return;
    }

    const liked = likedSet.has(trackId);

    if (liked) {
      const { error } = await supabase
        .from("likes")
        .delete()
        .eq("user_id", userId)
        .eq("track_id", trackId)
        .eq("month", month);

      if (error) console.error("Unlike error:", error);

      setLikedSet((prev) => {
        const s = new Set(prev);
        s.delete(trackId);
        return s;
      });

      setLikesMonth((prev) => {
        const m = new Map(prev);
        m.set(trackId, Math.max(0, (m.get(trackId) ?? 1) - 1));
        return m;
      });

      return;
    }

    const { error } = await supabase.from("likes").insert({
      user_id: userId,
      track_id: trackId,
      month,
    });

    if (error) console.error("Like error:", error);

    setLikedSet((prev) => new Set(prev).add(trackId));
    setLikesMonth((prev) => {
      const m = new Map(prev);
      m.set(trackId, (m.get(trackId) ?? 0) + 1);
      return m;
    });
  };

  return (
    // ⬇️ IMPORTANT: bottom padding so last row is NOT under PlayerBar
    <div className="mx-auto max-w-6xl p-6 pb-28 md:pb-32">
      <div className="mb-3">
        <div className="text-2xl font-semibold text-white">Pulse</div>
        <div className="text-sm text-white/60">Community signal + momentum.</div>
      </div>

      <div className="mb-4 flex w-full flex-wrap items-center gap-3 md:flex-nowrap md:justify-between">
        <div className="rounded-xl bg-white/10 px-4 py-2 text-white text-sm ring-1 ring-white/10">
          THIS MONTH REWARD POOL: {rewardPool} likes
        </div>

        <div className="flex w-full flex-wrap gap-3 md:w-auto md:flex-nowrap md:justify-end">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search track / artist / genre"
            className="h-10 w-full md:w-[320px] rounded-xl bg-white/10 px-4 text-white placeholder:text-white/40 ring-1 ring-white/10"
          />

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as CategoryKey)}
            className="h-10 min-w-[160px] rounded-xl bg-white/10 px-3 text-white ring-1 ring-white/10"
          >
            <option value="global">Category: Global</option>
            <option value="new_rising">Category: New & Rising</option>
            <option value="estonia">Category: Estonia</option>
          </select>

          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="h-10 min-w-[150px] rounded-xl bg-white/10 px-3 text-white ring-1 ring-white/10"
          >
            {availableGenres.map((g) => (
              <option key={g} value={g}>
                {g === "All genres" ? "All genres" : g}
              </option>
            ))}
          </select>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-10 min-w-[170px] rounded-xl bg-white/10 px-3 text-white ring-1 ring-white/10"
          >
            <option value="plays_month">Sort: Plays (month)</option>
            <option value="likes_month">Sort: Likes (month)</option>
          </select>
        </div>
      </div>

      <div className="rounded-2xl bg-white/10 ring-1 ring-white/10 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-semibold tracking-widest text-white/60">
          <div className="col-span-7">TRACK</div>
          <div className="col-span-2 text-right">PLAYS</div>
          <div className="col-span-2 text-right">LIKES</div>
          <div className="col-span-1 text-right">ACTION</div>
        </div>

        {loading ? (
          <div className="p-4 text-white/60">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-4 text-white/60">No tracks.</div>
        ) : (
          rows.map((t: any, idx: number) => {
            const id = String(t.id);
            const liked = likedSet.has(id);
            const likes = likesMonth.get(id) ?? 0;
            const plays = Number(t.plays_this_month ?? 0) || 0;
            const isCurrent = currentTrack?.id && String(currentTrack.id) === id;

            return (
              <div key={id} className="border-t border-white/10 px-4 py-4">
                <div className="grid grid-cols-12 gap-2 items-center">
                  {/* TRACK with AVATAR */}
                  <div className="col-span-7 flex items-center gap-3 min-w-0">
                    <div className="w-6 text-white/40">{idx + 1}</div>

                    <img
                      src={getArtworkSrc(t)}
                      alt={safeStr(t.title) || "Cover"}
                      className="h-10 w-10 rounded-xl object-cover ring-1 ring-white/10"
                      loading="lazy"
                    />

                    <div className="min-w-0">
                      <div className="text-white font-semibold truncate">
                        {safeStr(t.title) || "Untitled"}
                      </div>
                      <div className="text-sm text-white/60 truncate">
                        <Link
                          href={`/artists/${encodeURIComponent(safeStr(t.artist || "AI Artist"))}`}
                          className="hover:text-white"
                        >
                          {safeStr(t.artist || "AI Artist")}
                        </Link>
                        {" • "}
                        {safeStr(t.genre || "-")}
                      </div>
                    </div>
                  </div>

                  <div className="col-span-2 text-right text-white/80 tabular-nums">{plays}</div>

                  <div className="col-span-2 text-right text-white/80 tabular-nums flex items-center justify-end gap-3">
                    <span>{likes}</span>
                    <button
                      onClick={() => toggleLike(id)}
                      className="text-xl leading-none"
                      title={liked ? "Unlike" : "Like"}
                    >
                      {liked ? "❤️" : "🤍"}
                    </button>
                  </div>

                  <div className="col-span-1 flex justify-end">
                    <button
                      onClick={() => playTrack(t, rows)}
                      className="rounded-xl bg-gradient-to-r from-cyan-400 to-purple-500 px-4 py-2 text-white"
                    >
                      {isCurrent && isPlaying ? "Playing" : "Play"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}