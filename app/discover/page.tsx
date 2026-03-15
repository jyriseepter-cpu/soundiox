"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import ArtistPanel from "@/app/components/ArtistPanel";
import TrackCard from "@/app/components/TrackCard";
import CustomSelect from "@/app/components/CustomSelect";
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
  genre: string | null;
  audio_url: string | null;
  artwork_url: string | null;
  created_at: string | null;
  plays_all_time: number | null;
  plays_this_month: number | null;
  is_published: boolean | null;
  user_id: string | null;
};

type ProfileMini = ArtistIdentityProfile;
type DiscoverTrack = TrackWithResolvedArtist<TrackRow>;
type ViewerProfile = {
  role: string | null;
  plan: string | null;
  is_pro: boolean | null;
};

function pickTitle(t: DiscoverTrack) {
  return (t.title ?? "Untitled").toString();
}

function pickArtist(t: DiscoverTrack) {
  return t.artistDisplayName.toString();
}

function pickGenre(t: DiscoverTrack) {
  return (t.genre ?? "-").toString();
}

function getArtworkSrc(t: DiscoverTrack) {
  return (t.artwork_url ?? "/logo-new.png").toString();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function DiscoverPage() {
  const router = useRouter();
  const { playTrack, currentTrack, isPlaying } = usePlayer();

  const [tracks, setTracks] = useState<DiscoverTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [authSettling, setAuthSettling] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState<"premium" | "artist_pro" | null>(null);

  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("All genres");

  const [selectedTrack, setSelectedTrack] = useState<DiscoverTrack | null>(null);
  const [hasOAuthCode, setHasOAuthCode] = useState(false);
  const [viewerRole, setViewerRole] = useState<"listener" | "artist">("listener");
  const [viewerHasPaidPlan, setViewerHasPaidPlan] = useState(false);

  const nowPlayingId = (currentTrack as any)?.id ?? null;

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
            "id,title,artist,genre,audio_url,artwork_url,created_at,plays_all_time,plays_this_month,is_published,user_id"
          )
          .eq("is_published", true)
          .order("created_at", { ascending: false });

        if (error) throw error;

        if (!alive) return;

        const rawTracks = (data ?? []) as TrackRow[];

        const profileIds = Array.from(
          new Set(
            rawTracks
              .map((t) => t.user_id)
              .filter((id): id is string => typeof id === "string" && id.length > 0)
          )
        );

        let profileMap = new Map<string, NormalizedArtistIdentity>();

        if (profileIds.length > 0) {
          const { data: profiles, error: profilesError } = await supabase
            .from("profiles")
            .select("id, display_name, slug, avatar_url, is_founding, is_pro")
            .in("id", profileIds);

          if (profilesError) {
            console.warn("discover profiles warning:", profilesError.message);
          } else {
            profileMap = createArtistIdentityMap((profiles ?? []) as ProfileMini[]);
          }
        }

        const merged = enrichTracksWithArtistIdentity(rawTracks, profileMap);

        setTracks(merged);

        if (merged.length > 0) {
          setSelectedTrack((prev) => prev ?? merged[0]);
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
    let alive = true;

    async function loadViewerProfile() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;

        if (!user) {
          if (!alive) return;
          setViewerRole("listener");
          setViewerHasPaidPlan(false);
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role, plan, is_pro")
          .eq("id", user.id)
          .maybeSingle<ViewerProfile>();

        if (profileError) throw profileError;
        if (!alive) return;

        const nextRole: "listener" | "artist" =
          profile?.role === "artist" ? "artist" : "listener";
        const hasPaidPlan =
          Boolean(profile?.is_pro) ||
          profile?.plan === "premium" ||
          profile?.plan === "artist_pro";

        setViewerRole(nextRole);
        setViewerHasPaidPlan(hasPaidPlan);
      } catch (error) {
        console.warn("discover viewer profile warning:", error);
        if (!alive) return;
        setViewerRole("listener");
        setViewerHasPaidPlan(false);
      }
    }

    void loadViewerProfile();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadViewerProfile();
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

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

      const hay =
        `${t.title ?? ""} ${t.artistDisplayName ?? ""} ${t.genre ?? ""}`.toLowerCase();

      return hay.includes(q);
    });
  }, [tracks, search, genre]);

  async function handleUpgradePlan(plan: "premium" | "artist_pro") {
    try {
      setUpgradeLoading(plan);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (!session?.access_token) {
        setUpgradeLoading(null);
        router.push("/login");
        return;
      }

      const res = await fetch("/api/stripe/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          tier: plan,
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
      alert("Checkout URL missing");
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
            artistName={selectedTrack ? pickArtist(selectedTrack) : "AI Artist"}
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
            viewerRole={viewerRole}
            viewerHasPaidPlan={viewerHasPaidPlan}
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
