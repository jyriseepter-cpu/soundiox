"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { usePlayer } from "../../components/PlayerContext";

type ArtistRow = {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  avatar_url: string | null;
  genre: string | null;
  country: string | null;
  website: string | null;
  donate_enabled: boolean | null;
  created_at?: string | null;
};

type TrackRow = {
  id: string;
  title: string;
  artist: string;
  genre: string | null;
  audio_url: string;
  artwork_url: string | null;
  created_at: string | null;
  plays_all_time: number | null;
  plays_this_month: number | null;
};

type TrackLikeMonthlyRow = {
  track_id: string;
  month: string; // yyyy-mm-dd
  likes: number;
};

type TrackLikeAllTimeRow = {
  track_id: string;
  likes: number;
};

function formatDateShort(dateStr?: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = d.toLocaleString("en-US", { month: "short" });
  const yyyy = d.getFullYear();
  return `${dd} ${mm} ${yyyy}`;
}

function monthStartISO(d = new Date()) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  const yyyy = x.getFullYear();
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

export default function ArtistPage() {
  const router = useRouter();
  const params = useParams();

  // NB: ära tee slugile “space” vms — loeme URL-st ja otsime artists.slug
  const slug = decodeURIComponent(String(params?.artist || "")).toLowerCase();

  const { playTrack } = usePlayer();

  const [loading, setLoading] = useState(true);
  const [artist, setArtist] = useState<ArtistRow | null>(null);
  const [tracks, setTracks] = useState<TrackRow[]>([]);
  const [likesMonth, setLikesMonth] = useState<number>(0);
  const [likesAllTime, setLikesAllTime] = useState<number>(0);

  const [donateLoading, setDonateLoading] = useState<number | null>(null);

  const playsMonth = useMemo(
    () => tracks.reduce((sum, t) => sum + (t.plays_this_month || 0), 0),
    [tracks]
  );
  const playsAllTime = useMemo(
    () => tracks.reduce((sum, t) => sum + (t.plays_all_time || 0), 0),
    [tracks]
  );

  const firstRelease = useMemo(() => {
    if (!tracks.length) return null;
    const sorted = [...tracks].sort((a, b) => {
      const da = a.created_at ? new Date(a.created_at).getTime() : 0;
      const db = b.created_at ? new Date(b.created_at).getTime() : 0;
      return da - db;
    });
    return sorted[0];
  }, [tracks]);

  const latestRelease = useMemo(() => {
    if (!tracks.length) return null;
    const sorted = [...tracks].sort((a, b) => {
      const da = a.created_at ? new Date(a.created_at).getTime() : 0;
      const db = b.created_at ? new Date(b.created_at).getTime() : 0;
      return db - da;
    });
    return sorted[0];
  }, [tracks]);

  const mostPlayedAllTime = useMemo(() => {
    if (!tracks.length) return null;
    const sorted = [...tracks].sort(
      (a, b) => (b.plays_all_time || 0) - (a.plays_all_time || 0)
    );
    return sorted[0];
  }, [tracks]);

  async function handleDonate(artistSlug: string, amountCents: number) {
    try {
      setDonateLoading(amountCents);
      const res = await fetch("/api/stripe/donate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artistSlug, amount: amountCents }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data?.error || "Donate failed");
        return;
      }
      if (data?.url) window.location.href = data.url;
    } catch (e: any) {
      alert(e?.message || "Donate failed");
    } finally {
      setDonateLoading(null);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      // 1) Artist by slug
      const { data: artistData, error: artistErr } = await supabase
        .from("artists")
        .select("id,name,slug,bio,avatar_url,genre,country,website,donate_enabled,created_at")
        .eq("slug", slug)
        .maybeSingle();

      if (artistErr) console.error(artistErr);
      if (cancelled) return;

      const a = (artistData as ArtistRow) || null;
      setArtist(a);

      // 2) Tracks by artist name
      if (!a?.name) {
        setTracks([]);
        setLikesMonth(0);
        setLikesAllTime(0);
        setLoading(false);
        return;
      }

      const { data: trackData, error: trackErr } = await supabase
        .from("tracks")
        .select("id,title,artist,genre,audio_url,artwork_url,created_at,plays_all_time,plays_this_month")
        .eq("artist", a.name)
        .eq("is_published", true)
        .order("created_at", { ascending: false });

      if (trackErr) console.error(trackErr);
      if (cancelled) return;

      const t = ((trackData as TrackRow[]) || []).filter(Boolean);
      setTracks(t);

      const trackIds = t.map((x) => x.id);
      if (!trackIds.length) {
        setLikesMonth(0);
        setLikesAllTime(0);
        setLoading(false);
        return;
      }

      // 3) Likes this month
      const monthStart = monthStartISO(new Date());
      const { data: monthRows, error: monthErr } = await supabase
        .from("track_likes_monthly")
        .select("track_id,month,likes")
        .eq("month", monthStart)
        .in("track_id", trackIds);

      if (monthErr) console.error(monthErr);
      if (cancelled) return;

      const lm = ((monthRows as TrackLikeMonthlyRow[]) || []).reduce(
        (sum, r) => sum + (r.likes || 0),
        0
      );
      setLikesMonth(lm);

      // 4) Likes all-time
      const { data: allRows, error: allErr } = await supabase
        .from("track_likes_all_time")
        .select("track_id,likes")
        .in("track_id", trackIds);

      if (allErr) console.error(allErr);
      if (cancelled) return;

      const la = ((allRows as TrackLikeAllTimeRow[]) || []).reduce(
        (sum, r) => sum + (r.likes || 0),
        0
      );
      setLikesAllTime(la);

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const donateEnabled = artist?.donate_enabled ?? true;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-8">
      {/* Top header card */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur-xl">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex gap-4">
            <div className="relative h-14 w-14 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
              {artist?.avatar_url ? (
                <Image
                  src={artist.avatar_url}
                  alt={artist.name || "Artist"}
                  fill
                  className="object-cover"
                  sizes="56px"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-white/50">
                  🎵
                </div>
              )}
            </div>

            <div>
              <h1 className="text-3xl font-semibold text-white">
                {artist?.name || "Artist"}
              </h1>
              <div className="mt-1 text-sm text-white/70">
                Genre: <span className="text-white/90">{artist?.genre || "—"}</span> •{" "}
                Plays (month): <span className="text-white/90">{playsMonth}</span> •{" "}
                All time: <span className="text-white/90">{playsAllTime}</span> •{" "}
                Reward pool: <span className="text-white/90">{likesMonth} likes</span>
              </div>
              {artist?.bio ? (
                <p className="mt-2 max-w-2xl text-sm text-white/70">{artist.bio}</p>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
                  AI-only
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
                  New & Rising
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
                  Top Plays (Month)
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
                  You liked
                </span>
              </div>
            </div>
          </div>

          {/* Actions (Back samal real tieridega) */}
          {donateEnabled ? (
            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  onClick={() => handleDonate(slug, 300)}
                  disabled={donateLoading !== null}
                  className="h-10 rounded-xl bg-white/10 px-4 text-sm font-medium text-white hover:bg-white/15 disabled:opacity-60"
                  title="Donate €3"
                >
                  {donateLoading === 300 ? "…" : "€3"}
                </button>

                <button
                  onClick={() => handleDonate(slug, 500)}
                  disabled={donateLoading !== null}
                  className="h-10 rounded-xl bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-4 text-sm font-semibold text-black hover:opacity-95 disabled:opacity-60"
                  title="Donate €5"
                >
                  {donateLoading === 500 ? "…" : "Donate €5"}
                </button>

                <button
                  onClick={() => handleDonate(slug, 1000)}
                  disabled={donateLoading !== null}
                  className="h-10 rounded-xl bg-white/10 px-4 text-sm font-medium text-white hover:bg-white/15 disabled:opacity-60"
                  title="Donate €10"
                >
                  {donateLoading === 1000 ? "…" : "€10"}
                </button>

                <button
                  onClick={() => handleDonate(slug, 2000)}
                  disabled={donateLoading !== null}
                  className="h-10 rounded-xl bg-white/10 px-4 text-sm font-medium text-white hover:bg-white/15 disabled:opacity-60"
                  title="Donate €20"
                >
                  {donateLoading === 2000 ? "…" : "€20"}
                </button>

                <button
                  onClick={() => router.back()}
                  className="h-10 rounded-xl bg-white/10 px-4 text-sm font-medium text-white hover:bg-white/15"
                >
                  Back
                </button>
              </div>

              <div className="text-xs text-white/60">70% goes directly to the creator</div>
            </div>
          ) : (
            <button
              onClick={() => router.back()}
              className="h-10 rounded-xl bg-white/10 px-4 text-sm font-medium text-white hover:bg-white/15"
            >
              Back
            </button>
          )}
        </div>
      </div>

      {/* HISTORY */}
      <div className="mt-6">
        <div className="mb-2 text-xs font-semibold tracking-wider text-white/60">HISTORY</div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <div className="text-xs text-white/60">Joined</div>
            <div className="mt-1 text-lg font-semibold text-white">
              {formatDateShort(artist?.created_at)}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <div className="text-xs text-white/60">First release</div>
            <div className="mt-1 text-lg font-semibold text-white">
              {formatDateShort(firstRelease?.created_at)}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <div className="text-xs text-white/60">Latest release</div>
            <div className="mt-1 text-lg font-semibold text-white">
              {formatDateShort(latestRelease?.created_at)}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <div className="text-xs text-white/60">Total tracks</div>
            <div className="mt-1 text-lg font-semibold text-white">{tracks.length}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <div className="text-xs text-white/60">Most played (all time)</div>
            <div className="mt-1 text-lg font-semibold text-white">
              {mostPlayedAllTime?.title || "—"}
            </div>
            <div className="text-xs text-white/60">
              {(mostPlayedAllTime?.plays_all_time || 0) + " plays"}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <div className="text-xs text-white/60">Likes</div>
            <div className="mt-1 text-lg font-semibold text-white">{likesAllTime} all-time</div>
            <div className="text-xs text-white/60">{likesMonth} this month</div>
          </div>
        </div>
      </div>

      {/* TRACKS */}
      <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-white">Tracks</div>
          {loading ? (
            <div className="text-xs text-white/60">Loading…</div>
          ) : (
            <div className="text-xs text-white/60">
              {tracks.length} track{tracks.length === 1 ? "" : "s"}
            </div>
          )}
        </div>

        {tracks.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-white/70">
            No tracks found for this artist.
          </div>
        ) : (
          <div className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10">
            {tracks.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 bg-black/20 p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="relative h-12 w-12 flex-none overflow-hidden rounded-xl border border-white/10 bg-white/5">
                    {t.artwork_url ? (
                      <Image
                        src={t.artwork_url}
                        alt={t.title}
                        fill
                        className="object-cover"
                        sizes="48px"
                      />
                    ) : null}
                  </div>

                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{t.title}</div>
                    <div className="truncate text-xs text-white/60">
                      {t.genre || artist?.genre || "—"} • {formatDateShort(t.created_at)}
                    </div>
                  </div>
                </div>

                <div className="flex flex-none items-center gap-2">
                  <div className="hidden text-right text-xs text-white/60 md:block">
                    <div>{t.plays_this_month || 0} plays (month)</div>
                    <div>{t.plays_all_time || 0} plays (all)</div>
                  </div>

                  <button
                    onClick={() => playTrack(t as any, tracks as any)}
                    className="h-9 rounded-xl bg-white/10 px-4 text-sm font-medium text-white hover:bg-white/15"
                  >
                    Play
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* TIMELINE */}
      <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
        <div className="mb-3 text-sm font-semibold text-white">Timeline</div>

        {tracks.length === 0 ? (
          <div className="text-sm text-white/70">No timeline yet.</div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs text-white/60">Released track</div>
              <div className="mt-1 text-sm font-semibold text-white">
                {latestRelease?.title || "—"}
              </div>
              <div className="mt-1 text-xs text-white/60">
                {formatDateShort(latestRelease?.created_at)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}