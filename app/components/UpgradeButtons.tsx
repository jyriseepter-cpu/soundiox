"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Tier = "premium_monthly";

export default function UpgradeButtons() {
  const [loading, setLoading] = useState<Tier | null>(null);

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
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => startCheckout("premium_monthly")}
        disabled={loading !== null}
        className={`${baseBtn} ${premiumBtn} w-full`}
      >
        {loading === "premium_monthly" ? "Loading..." : "Upgrade to Premium"}
      </button>
    </div>
  );
}
