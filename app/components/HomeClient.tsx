"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
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
  user_id: string | null;
};

type HomeTrack = TrackWithResolvedArtist<TrackRow>;

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
  const [tracks, setTracks] = useState<HomeTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTracks() {
      const { data, error } = await supabase
        .from("tracks")
        .select("id,title,artist,artwork_url,user_id")
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) {
        setError(error.message);
      } else {
        const rawTracks = (data ?? []) as TrackRow[];
        const profileIds = Array.from(
          new Set(
            rawTracks
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

          if (profileError) {
            setError(profileError.message);
          } else {
            profileMap = createArtistIdentityMap(
              (profiles ?? []) as ArtistIdentityProfile[]
            );
          }
        }

        setTracks(enrichTracksWithArtistIdentity(rawTracks, profileMap));
      }

      setLoading(false);
    }

    void loadTracks();
  }, []);

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

              <a
                href="#monetization"
                className="rounded-full border border-fuchsia-300/25 bg-fuchsia-400/12 px-4 py-2 text-sm font-semibold text-fuchsia-100 shadow-[0_0_18px_rgba(217,70,239,0.12)] hover:bg-fuchsia-400/16"
              >
                Monetization
              </a>
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

            <section
              id="monetization"
              className="mt-10 rounded-3xl bg-white/6 p-6 ring-1 ring-white/10 backdrop-blur"
            >
              <h2 className="text-2xl font-bold text-white">Monetization</h2>

              <div className="mt-6 space-y-6">
                <div className="rounded-2xl bg-black/20 p-5 ring-1 ring-white/10">
                  <div className="text-lg font-bold text-white">Pulse reward system</div>
                  <div className="mt-3 space-y-2 text-base font-medium leading-7 text-white/82">
                    <p>
                      When SoundioX reaches 50,000 users, the Pulse award system
                      activates.
                    </p>
                    <p>
                      The track with the most likes receives{" "}
                      <span className="text-cyan-300">€20,000</span>.
                    </p>
                    <p>
                      Second place receives{" "}
                      <span className="text-cyan-300">€10,000</span>.
                    </p>
                    <p>
                      Third place receives{" "}
                      <span className="text-cyan-300">€5,000</span>.
                    </p>
                    <p>
                      After that the payout line continues deeper into the ranking
                      and grows harmoniously as the user base grows.
                    </p>
                    <p>
                      In addition, the top track of every genre receives{" "}
                      <span className="text-fuchsia-300">€2,000</span> each month.
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl bg-black/20 p-5 ring-1 ring-white/10">
                  <div className="text-lg font-bold text-white">Account types</div>

                  <div className="mt-5 space-y-4">
                    <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                      <div className="text-base font-bold text-white">Free</div>
                      <div className="mt-2 text-sm font-medium leading-6 text-white/78">
                        Listen to music, discover artists, and create playlists.
                      </div>
                    </div>

                    <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                      <div className="text-base font-bold text-white">Premium</div>
                      <div className="mt-2 text-sm font-medium leading-6 text-white/78">
                        Includes 100 likes per month.
                      </div>
                    </div>

                    <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                      <div className="text-base font-bold text-white">Artist</div>
                      <div className="mt-2 text-sm font-medium leading-6 text-white/78">
                        Upload tracks, build an artist profile, and receive 100 likes
                        per month.
                      </div>
                    </div>

                    <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                      <div className="text-base font-bold text-white">
                        Founding Artist
                      </div>
                      <div className="mt-2 text-sm font-medium leading-6 text-white/78">
                        Early artist status with lifetime access to the platform.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="pt-8 lg:pt-8">
            <div className="rounded-3xl bg-white/10 p-5 ring-1 ring-white/10 backdrop-blur">
              <div className="text-white">
                <div className="text-lg font-bold">Top Tracks</div>
                <div className="text-sm font-medium text-white/70">
                  Trending right now
                </div>
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

                      <Link
                        href="/discover"
                        className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-bold text-white ring-1 ring-white/10 hover:opacity-95"
                      >
                        Play
                      </Link>
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