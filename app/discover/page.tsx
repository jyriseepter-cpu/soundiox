"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import ArtistPanel from "@/app/components/ArtistPanel";
import TrackCard from "@/app/components/TrackCard";
import CustomSelect from "@/app/components/CustomSelect";
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

function getCookieValue(name: string) {
  if (typeof document === "undefined") return null;

  const cookies = document.cookie ? document.cookie.split("; ") : [];

  for (const cookie of cookies) {
    const [key, ...rest] = cookie.split("=");
    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return null;
}

function deleteCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function DiscoverPage() {
  const router = useRouter();
  const { playTrack, currentTrack, isPlaying } = usePlayer();

  const [tracks, setTracks] = useState<TrackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [authSettling, setAuthSettling] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState<"premium" | "artist_pro" | null>(null);

  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("All genres");

  const [selectedTrack, setSelectedTrack] = useState<TrackRow | null>(null);
  const [claimingInvite, setClaimingInvite] = useState(false);
  const [hasOAuthCode, setHasOAuthCode] = useState(false);

  const nowPlayingId = (currentTrack as any)?.id ?? null;

  const claimStartedRef = useRef(false);
  const authReadyRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setHasOAuthCode(!!params.get("code"));
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadTracks() {
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

        if (!alive) return;

        const list = (data ?? []) as TrackRow[];
        setTracks(list);

        if (list.length > 0) {
          setSelectedTrack((prev) => prev ?? list[0]);
        }
      } catch (e: any) {
        console.warn("discover fetch tracks warning:", {
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

    void loadTracks();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function settleAuth() {
      if (authReadyRef.current) return;

      if (hasOAuthCode) {
        setAuthSettling(true);
      }

      for (let attempt = 0; attempt < 14; attempt++) {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user?.id) {
          authReadyRef.current = true;

          if (!cancelled && hasOAuthCode) {
            router.replace("/discover");
          }

          break;
        }

        await sleep(400);
      }

      if (!authReadyRef.current) {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user?.id) {
          authReadyRef.current = true;
        }
      }

      if (!cancelled) {
        setAuthSettling(false);
      }
    }

    void settleAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session?.user?.id) {
        authReadyRef.current = true;

        if (hasOAuthCode) {
          router.replace("/discover");
        }

        setAuthSettling(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [hasOAuthCode, router]);

  useEffect(() => {
    let cancelled = false;

    async function tryClaimFoundingInvite() {
      if (claimStartedRef.current) return;

      const inviteToken = getCookieValue("soundiox_invite_token");
      if (!inviteToken) return;

      let accessToken: string | null = null;
      let userId: string | null = null;

      for (let attempt = 0; attempt < 12; attempt++) {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          console.warn("discover invite getSession warning:", sessionError.message);
        }

        if (session?.access_token && session?.user?.id) {
          accessToken = session.access_token;
          userId = session.user.id;
          break;
        }

        await sleep(500);
      }

      if (!accessToken || !userId) {
        return;
      }

      claimStartedRef.current = true;
      setClaimingInvite(true);

      try {
        const res = await fetch("/api/founding/claim", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ inviteToken }),
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          console.warn("discover founding claim warning:", data);
          claimStartedRef.current = false;
          return;
        }

        deleteCookie("soundiox_invite_token");

        if (cancelled) return;

        router.replace("/account?welcome=founding");
      } catch (error: any) {
        console.warn("discover founding claim unexpected warning:", error?.message || error);
        claimStartedRef.current = false;
      } finally {
        if (!cancelled) {
          setClaimingInvite(false);
        }
      }
    }

    const timer = window.setTimeout(() => {
      void tryClaimFoundingInvite();
    }, 1400);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session?.user?.id) {
        void tryClaimFoundingInvite();
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    function resetUpgradeState() {
      setUpgradeLoading(null);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        setUpgradeLoading(null);
      }
    }

    window.addEventListener("pageshow", resetUpgradeState);
    window.addEventListener("focus", resetUpgradeState);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pageshow", resetUpgradeState);
      window.removeEventListener("focus", resetUpgradeState);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
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

  async function handleUpgradePlan(plan: "premium" | "artist_pro") {
    try {
      setUpgradeLoading(plan);

      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!user) {
        setUpgradeLoading(null);
        router.push("/login");
        return;
      }

      const res = await fetch("/api/stripe/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plan,
          email: user.email || undefined,
          userId: user.id,
        }),
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        setUpgradeLoading(null);
        alert(
          payload?.message ||
            payload?.error ||
            JSON.stringify(payload) ||
            "Stripe checkout failed"
        );
        return;
      }

      if (payload?.url) {
        window.location.href = payload.url;
        return;
      }

      setUpgradeLoading(null);
      alert(
        payload?.message ||
          payload?.error ||
          JSON.stringify(payload) ||
          "Checkout URL missing"
      );
    } catch (error: any) {
      console.warn("Upgrade checkout warning:", error?.message || error);
      setUpgradeLoading(null);
      alert(error?.message || "Checkout failed");
    }
  }

  const customGenreOptions = genreOptions.map((g) => ({
    value: g,
    label: g,
  }));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6">
      {authSettling ? (
        <div className="mb-4 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
          Signing you in...
        </div>
      ) : null}

      {claimingInvite ? (
        <div className="mb-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          Activating Founding Artist invite...
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <input
          className="h-10 w-full rounded-xl bg-white/10 px-4 text-white placeholder-white/50 ring-1 ring-white/10 outline-none focus:ring-white/20 md:max-w-[520px]"
          placeholder="Search tracks, artists, genres..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <CustomSelect
          value={genre}
          onChange={setGenre}
          options={customGenreOptions}
          className="w-full md:w-[200px]"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-2xl bg-white/6 p-3 ring-1 ring-white/10">
          <div className="mb-2 flex items-center justify-between px-2">
            <div className="font-semibold text-white/90">Discover</div>
            <div className="text-sm text-white/50">
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
            onUpgradePlan={handleUpgradePlan}
          />

          {upgradeLoading ? (
            <div className="mt-3 text-center text-xs text-white/50">
              Opening checkout...
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}