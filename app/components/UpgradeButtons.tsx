"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { formatEuroPrice, SOUNDIOX_PRICING } from "@/lib/pricing";
import { isLifetimeCampaignActive } from "@/lib/lifetimeCampaign";

type UpgradeTier = "premium" | "artist";

type ProfileRow = {
  plan: string | null;
  is_founding: boolean | null;
  role: string | null;
};

type Props = {
  onUpgradePlan?: (plan: UpgradeTier) => Promise<void>;
  viewerHasPaidPlan?: boolean;
  className?: string;
};

function normalizeRole(value: string | null | undefined) {
  return value === "artist" ? "artist" : "listener";
}

function normalizePlan(value: string | null | undefined) {
  if (value === "premium") return "premium";
  if (value === "artist") return "artist";
  if (value === "lifetime") return "lifetime";
  return "free";
}

export default function UpgradeButtons({
  onUpgradePlan,
  viewerHasPaidPlan = false,
  className = "",
}: Props) {
  const router = useRouter();

  const [loading, setLoading] = useState<UpgradeTier | null>(null);
  const [checkingProfile, setCheckingProfile] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [viewerRole, setViewerRole] = useState<"listener" | "artist">("listener");
  const [viewerPlan, setViewerPlan] = useState<"free" | "premium" | "artist" | "lifetime">(
    "free"
  );
  const [viewerIsFounding, setViewerIsFounding] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          throw userError;
        }

        if (!user?.id) {
          if (mounted) {
            setUserId(null);
            setViewerRole("listener");
            setViewerPlan("free");
            setViewerIsFounding(false);
          }
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("plan, is_founding, role")
          .eq("id", user.id)
          .maybeSingle<ProfileRow>();

        if (error) {
          throw error;
        }

        if (mounted) {
          setUserId(user.id);
          setViewerRole(normalizeRole(data?.role));
          setViewerPlan(normalizePlan(data?.plan));
          setViewerIsFounding(Boolean(data?.is_founding));
        }
      } catch (error) {
        console.error("Failed to load profile for upgrade buttons:", error);
        if (mounted) {
          setUserId(null);
          setViewerRole("listener");
          setViewerPlan("free");
          setViewerIsFounding(false);
        }
      } finally {
        if (mounted) {
          setCheckingProfile(false);
        }
      }
    }

    void loadProfile();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadProfile();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handlePremiumClick() {
    if (viewerIsFounding) {
      return;
    }

    if (!userId) {
      router.push("/login");
      return;
    }

    if (!onUpgradePlan) {
      router.push("/account");
      return;
    }

    try {
      setLoading("premium");
      await onUpgradePlan("premium");
    } finally {
      setLoading(null);
    }
  }

  async function handleArtistClick() {
    const campaignActive = isLifetimeCampaignActive();

    if (viewerIsFounding) {
      return;
    }

    if (!userId) {
      router.push("/login");
      return;
    }

    if (campaignActive) {
      router.push("/account");
      return;
    }

    if (!onUpgradePlan) {
      router.push("/account");
      return;
    }

    try {
      setLoading("artist");
      await onUpgradePlan("artist");
    } finally {
      setLoading(null);
    }
  }

  const campaignActive = isLifetimeCampaignActive();
  const hasArtistAccess =
    viewerIsFounding || viewerRole === "artist" || viewerPlan === "artist";
  const hasPaidAccess = viewerHasPaidPlan || viewerPlan === "premium" || hasArtistAccess;
  const statusActiveLabel = hasArtistAccess
    ? "Artist access active"
    : hasPaidAccess
      ? "Premium access active"
      : null;

  const baseBtn =
    "flex h-11 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";
  const premiumBtn =
    "bg-yellow-400 text-black hover:bg-yellow-300";
  const artistBtn = campaignActive
    ? "bg-gradient-to-r from-rose-500 to-orange-500 text-white hover:opacity-95"
    : "bg-gradient-to-r from-cyan-400 to-fuchsia-500 text-white hover:opacity-95";
  const statusBox =
    "w-full rounded-xl border border-white/10 bg-white/8 px-4 py-3 text-sm font-semibold text-white/80";

  return (
    <div className={`space-y-3 ${className}`.trim()}>
      {checkingProfile ? (
        <div className={statusBox}>Checking access...</div>
      ) : viewerIsFounding ? (
        <div className={statusBox}>Founding Artist — Lifetime access</div>
      ) : statusActiveLabel ? (
        <div className={statusBox}>{statusActiveLabel}</div>
      ) : null}

      {!checkingProfile && !viewerIsFounding ? (
        <>
          <button
            type="button"
            onClick={handlePremiumClick}
            disabled={loading !== null}
            className={`${baseBtn} ${premiumBtn}`}
          >
            {loading === "premium"
              ? "Opening..."
              : `Upgrade to Premium • ${formatEuroPrice(
                  SOUNDIOX_PRICING.premium
                )}`}
          </button>

          <div className="text-center text-xs font-semibold text-white/55">
            Premium unlocks monthly likes for{" "}
            {formatEuroPrice(SOUNDIOX_PRICING.premium)}. Playlists stay
            available for logged-in users.
          </div>

          <button
            type="button"
            onClick={handleArtistClick}
            disabled={loading !== null}
            className={`${baseBtn} ${artistBtn}`}
          >
            {loading === "artist"
              ? "Opening..."
              : `Become Artist • ${formatEuroPrice(
                  SOUNDIOX_PRICING.artist
                )}`}
          </button>

          <div className="text-center text-xs font-semibold text-white/55">
            {`Artist unlocks uploads and artist access for ${formatEuroPrice(
              SOUNDIOX_PRICING.artist
            )}.`}
          </div>
        </>
      ) : null}
    </div>
  );
}
