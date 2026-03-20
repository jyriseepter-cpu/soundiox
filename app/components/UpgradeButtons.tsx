"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Tier = "premium_monthly";

type ProfileRow = {
  lifetime_access: boolean | null;
};

export default function UpgradeButtons() {
  const [loading, setLoading] = useState<Tier | null>(null);
  const [checkingProfile, setCheckingProfile] = useState(true);
  const [lifetimeAccess, setLifetimeAccess] = useState(false);

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
            setLifetimeAccess(false);
          }
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("lifetime_access")
          .eq("id", user.id)
          .maybeSingle<ProfileRow>();

        if (error) {
          throw error;
        }

        if (mounted) {
          setLifetimeAccess(Boolean(data?.lifetime_access));
        }
      } catch (error) {
        console.error("Failed to load profile for upgrade buttons:", error);
        if (mounted) {
          setLifetimeAccess(false);
        }
      } finally {
        if (mounted) {
          setCheckingProfile(false);
        }
      }
    }

    loadProfile();

    return () => {
      mounted = false;
    };
  }, []);

  async function startCheckout(tier: Tier) {
    try {
      setLoading(tier);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (!session?.access_token) {
        throw new Error("Please log in to start checkout.");
      }

      const res = await fetch("/api/stripe/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          tier,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        alert(
          data?.message ||
            data?.error ||
            JSON.stringify(data) ||
            "Stripe checkout failed"
        );
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
        return;
      }

      alert(
        data?.message ||
          data?.error ||
          JSON.stringify(data) ||
          "Checkout URL missing"
      );
    } catch (e: any) {
      alert(e?.message || "Checkout failed");
    } finally {
      setLoading(null);
    }
  }

  const baseBtn =
    "h-10 rounded-xl px-4 text-sm font-semibold text-white transition disabled:opacity-60";
  const premiumBtn =
    "bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500 hover:opacity-95";
  const statusBox =
    "w-full rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200";

  if (checkingProfile) {
    return (
      <div className="space-y-3">
        <div className={statusBox}>Checking access...</div>
      </div>
    );
  }

  if (lifetimeAccess) {
    return (
      <div className="space-y-3">
        <div className={statusBox}>Lifetime Access Active</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => startCheckout("premium_monthly")}
        disabled={loading !== null}
        className={`${baseBtn} ${premiumBtn} w-full`}
      >
        {loading === "premium_monthly"
          ? "Loading..."
          : "30 days free, then EUR 5.99/month"}
      </button>
    </div>
  );
}