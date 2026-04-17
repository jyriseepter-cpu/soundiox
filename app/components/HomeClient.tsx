"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { usePlayer } from "@/app/components/PlayerContext";
import {
  createArtistIdentityMap,
  enrichTracksWithArtistIdentity,
  type ArtistIdentityProfile,
  type NormalizedArtistIdentity,
  type TrackWithResolvedArtist,
} from "@/lib/artistIdentity";

type TrackRow = {
  id: string;
  title: string | null;
  artist: string | null;
  artwork_url: string | null;
  is_promo: boolean | null;
  user_id: string | null;
  audio_url: string | null;
};

type HomeTrack = TrackWithResolvedArtist<TrackRow>;

type TrackLikeMonthlyRow = {
  track_id: string;
  likes: number | null;
};

type TrackLikeAllTimeRow = {
  track_id: string;
  likes: number | null;
};

function monthStartISO(d = new Date()) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  const yyyy = x.getFullYear();
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

function getArtworkSrc(t: HomeTrack) {
  if (!t.artwork_url) return "/logo-new.png";
  return t.artwork_url;
}

function pickTitle(t: HomeTrack) {
  return (t.title ?? "Untitled").toString();
}

function pickArtist(t: HomeTrack) {
  return t.artistDisplayName.toString();
}

export default function HomeClient() {
  const { playTrack, currentTrack, isPlaying } = usePlayer();
  const [tracks, setTracks] = useState<HomeTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentTrackId = currentTrack?.id ?? null;

  useEffect(() => {
    async function loadTracks() {
      try {
        const monthStart = monthStartISO(new Date());

        const { data: monthLikes, error: monthError } = await supabase
          .from("track_likes_monthly")
          .select("track_id,likes")
          .eq("month", monthStart)
          .order("likes", { ascending: false })
          .limit(5);

        if (monthError) throw monthError;

        const monthlyRows = ((monthLikes ?? []) as TrackLikeMonthlyRow[]).filter(
          (row) => (row.likes ?? 0) > 0 && typeof row.track_id === "string" && row.track_id.length > 0
        );

        let rankedTrackIds = monthlyRows.map((row) => row.track_id);
        let rankingLabel = "Most liked this month";

        if (!rankedTrackIds.length) {
          const { data: allTimeLikes, error: allTimeError } = await supabase
            .from("track_likes_all_time")
            .select("track_id,likes")
            .order("likes", { ascending: false })
            .limit(5);

          if (allTimeError) throw allTimeError;

          rankedTrackIds = ((allTimeLikes ?? []) as TrackLikeAllTimeRow[])
            .filter(
              (row) =>
                (row.likes ?? 0) > 0 &&
                typeof row.track_id === "string" &&
                row.track_id.length > 0
            )
            .map((row) => row.track_id);
          rankingLabel = "Most liked of all time";
        }

        if (!rankedTrackIds.length) {
          setTracks([]);
          setError(null);
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from("tracks")
          .select("id,title,artist,artwork_url,is_promo,user_id,audio_url")
          .eq("is_published", true)
          .in("id", rankedTrackIds);

        if (error) throw error;

        const rawTracks = (data ?? []) as TrackRow[];
        const rankedTrackMap = new Map(rawTracks.map((track) => [track.id, track]));
        const rankedTracks = rankedTrackIds
          .map((trackId) => rankedTrackMap.get(trackId))
          .filter((track): track is TrackRow => Boolean(track));

        const profileIds = Array.from(
          new Set(
            rankedTracks
              .map((track) => track.user_id)
              .filter((id): id is string => typeof id === "string" && id.length > 0)
          )
        );

        let profileMap = new Map<string, NormalizedArtistIdentity>();

        if (profileIds.length > 0) {
          const { data: profiles, error: profileError } = await supabase
            .from("profiles")
            .select("id, display_name, slug, avatar_url, is_founding")
            .in("id", profileIds);

          if (profileError) throw profileError;

          profileMap = createArtistIdentityMap((profiles ?? []) as ArtistIdentityProfile[]);
        }

        const enrichedTracks = enrichTracksWithArtistIdentity(rankedTracks, profileMap).map(
          (track) => ({
            ...track,
            rankingLabel,
          })
        );

        setTracks(enrichedTracks);
        setError(null);
      } catch (error: any) {
        setError(error?.message || "Could not load top tracks");
      } finally {
        setLoading(false);
      }
    }

    void loadTracks();
  }, []);

  const rankingCopy = useMemo(() => {
    return (tracks[0] as (HomeTrack & { rankingLabel?: string }) | undefined)?.rankingLabel
      ?? "Most liked right now";
  }, [tracks]);

  return (
    <main className="px-6 pb-10">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
          <div className="pt-8 lg:pt-8">
            <h1 className="text-5xl font-bold leading-[1.02] tracking-[-0.03em] text-white md:text-6xl">
              The new generation
              <br />
              of{" "}
              <span className="bg-gradient-to-r from-cyan-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
                AI music
              </span>{" "}
              starts
              <br />
              here.
            </h1>

            <p className="mt-6 max-w-xl text-base font-medium text-white/78">
              SoundioX is an AI-only social music platform where creators publish,
              listeners discover, and charts reward real engagement.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/join-wave"
                className="rounded-2xl bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500 px-6 py-3 font-bold text-white ring-1 ring-white/10 hover:opacity-95"
              >
                Join the Wave
              </Link>

              <Link
                href="/founding-artists"
                className="rounded-2xl bg-white/10 px-6 py-3 font-bold text-white ring-1 ring-white/10 hover:bg-white/15"
              >
                Founding Artist
              </Link>
            </div>

            <div className="mt-3">
              <Link
                href="/about/pulse"
                className="inline-flex rounded-xl bg-white/10 px-5 py-2.5 text-sm font-bold text-white ring-1 ring-white/10 hover:bg-white/15"
              >
                Monetization
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-5 text-sm">
              <div className="flex items-center gap-2 text-cyan-100">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-cyan-400/18 text-xs font-bold">
                  ✓
                </span>
                <span className="font-semibold">AI-only uploads</span>
              </div>

              <div className="flex items-center gap-2 text-violet-100">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-violet-400/18 text-xs font-bold">
                  ⚡
                </span>
                <span className="font-semibold">New &amp; Rising</span>
              </div>

              <div className="flex items-center gap-2 text-fuchsia-100">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-fuchsia-400/18 text-xs font-bold">
                  🌍
                </span>
                <span className="font-semibold">Global charts</span>
              </div>
            </div>
          </div>

          <div className="pt-8 lg:pt-8">
            <div className="rounded-3xl bg-white/10 p-5 ring-1 ring-white/10 backdrop-blur">
              <div className="text-white">
                <div className="text-lg font-bold">Top Tracks</div>
                <div className="text-sm font-medium text-white/70">{rankingCopy}</div>
              </div>

              <div className="mt-4 space-y-3">
                {loading ? (
                  <div className="text-sm font-medium text-white/70">Loading...</div>
                ) : error ? (
                  <div className="text-sm font-medium text-red-400">
                    Error: {error}
                  </div>
                ) : tracks.length === 0 ? (
                  <div className="text-sm font-medium text-white/70">
                    No tracks found.
                  </div>
                ) : (
                  tracks.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between rounded-2xl bg-black/20 px-4 py-3 ring-1 ring-white/10"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={getArtworkSrc(t)}
                          alt=""
                          className="h-10 w-10 rounded-xl object-cover ring-1 ring-white/10"
                        />
                        <div className="leading-tight">
                          <div className="text-sm font-bold text-white">
                            {pickTitle(t)}
                          </div>
                          <div className="text-xs font-semibold text-white/72">
                            {pickArtist(t)}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => void playTrack(t as any, tracks as any)}
                        className="cursor-pointer rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-bold text-white ring-1 ring-white/10 transition hover:opacity-95"
                      >
                        {currentTrackId === t.id && isPlaying ? "Playing" : "Play"}
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4 h-2 w-full rounded-full bg-white/10">
                <div className="h-2 w-2/3 rounded-full bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500" />
              </div>

              <div className="mt-2 text-xs font-semibold text-white/70">
                Ready to play
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
