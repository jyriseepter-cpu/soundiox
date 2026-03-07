"use client";

import { useState } from "react";

type Tier =
  | "premium_monthly"
  | "premium_yearly"
  | "artist_pro_monthly"
  | "artist_pro_yearly";

type Props = {
  email?: string | null;
};

export default function UpgradeButtons({ email }: Props) {
  const [loading, setLoading] = useState<Tier | null>(null);

  async function startCheckout(tier: Tier) {
    try {
      setLoading(tier);

      const res = await fetch("/api/stripe/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, email: email || undefined }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Checkout failed");
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
        return;
      }

      alert("Checkout URL missing");
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
  const proBtn =
    "bg-gradient-to-r from-fuchsia-500 via-purple-500 to-pink-500 hover:opacity-95";

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
          : "Upgrade to Premium (€5.99 / month)"}
      </button>

      <button
        type="button"
        onClick={() => startCheckout("artist_pro_monthly")}
        disabled={loading !== null}
        className={`${baseBtn} ${proBtn} w-full`}
      >
        {loading === "artist_pro_monthly"
          ? "Loading..."
          : "Become Artist Pro (€14.99 / month)"}
      </button>
    </div>
  );
}