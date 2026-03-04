"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type TrackRow = {
  id: string;
  title: string | null;
  artist: string | null;
  artwork_url: string | null;
};

function getArtworkSrc(t: TrackRow) {
  if (!t.artwork_url) return "/logo-new.png";
  return t.artwork_url;
}

function pickTitle(t: TrackRow) {
  return (t.title ?? "Untitled").toString();
}

function pickArtist(t: TrackRow) {
  return (t.artist ?? "AI Artist").toString();
}

export default function HomeClient() {
  const [tracks, setTracks] = useState<TrackRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("tracks")
        .select("id,title,artist,artwork_url")
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(5);

      if (cancelled) return;

      if (error) {
        setError(error.message);
        setTracks([]);
        return;
      }

      setError(null);
      setTracks((data ?? []) as TrackRow[]);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          {/* LEFT */}
          <div className="pt-8">
            <div className="inline-flex items-center gap-3 rounded-full bg-white/10 px-4 py-2 text-sm text-white/80 ring-1 ring-white/10">
              <span>AI-only music platform</span>
              <span className="opacity-60">•</span>
              <span>Charts</span>
              <span className="opacity-60">•</span>
              <span>Community</span>
            </div>

            <h1 className="mt-6 text-5xl font-semibold leading-[1.05] text-white md:text-6xl">
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

            <p className="mt-6 max-w-xl text-white/75">
              SoundioX is an AI-only social music platform where creators publish,
              listeners discover, and charts reward real engagement.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/discover"
                className="rounded-2xl bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500 px-6 py-3 font-semibold text-white ring-1 ring-white/10 hover:opacity-95"
              >
                Join the Wave
              </Link>

              <Link
                href="/login"
                className="rounded-2xl bg-white/10 px-6 py-3 font-semibold text-white ring-1 ring-white/10 hover:bg-white/15"
              >
                Become a Founding Artist
              </Link>

              <Link
                href="/about/pulse"
                className="rounded-2xl bg-white/10 px-6 py-3 font-semibold text-white ring-1 ring-white/10 hover:bg-white/15"
              >
                About Pulse
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-6 text-sm text-white/70">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-white/60" />
                AI-only uploads
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-white/60" />
                New &amp; Rising
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-white/60" />
                Global charts
              </div>
            </div>
          </div>

          {/* RIGHT: TOP TRACKS */}
          <div className="lg:pt-10">
            <div className="rounded-3xl bg-white/10 p-5 ring-1 ring-white/10 backdrop-blur">
              <div className="text-white">
                <div className="text-lg font-semibold">Top Tracks</div>
                <div className="text-sm text-white/70">Trending right now</div>
              </div>

              <div className="mt-4 space-y-3">
                {error ? (
                  <div className="text-sm text-red-400">Error: {error}</div>
                ) : tracks.length === 0 ? (
                  <div className="text-sm text-white/70">No tracks found.</div>
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
                          <div className="text-sm font-semibold text-white">
                            {pickTitle(t)}
                          </div>
                          <div className="text-xs text-white/70">
                            {pickArtist(t)}
                          </div>
                        </div>
                      </div>

                      <Link
                        href="/discover"
                        className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/10 hover:bg-white/15"
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

              <div className="mt-2 text-xs text-white/60">Now playing</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}