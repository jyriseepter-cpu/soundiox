"use client";

import { useState } from "react";

type Plan = "premium" | "artist_pro";

type Props = {
  email?: string | null;
  userId?: string | null;
};

export default function UpgradeButtons({ email, userId }: Props) {
  const [loading, setLoading] = useState<Plan | null>(null);

  async function startCheckout(plan: Plan) {
    try {
      if (!email || !userId) {
        alert("Please log in again before starting checkout.");
        return;
      }

      setLoading(plan);

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          email,
          userId,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        alert(data?.message || data?.error || "Checkout failed");
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
  const artistBtn =
    "bg-gradient-to-r from-fuchsia-500 via-purple-500 to-pink-500 hover:opacity-95";

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => startCheckout("premium")}
        disabled={loading !== null}
        className={`${baseBtn} ${premiumBtn} w-full`}
      >
        {loading === "premium" ? "Opening..." : "Upgrade to Premium"}
      </button>

      <button
        type="button"
        onClick={() => startCheckout("artist_pro")}
        disabled={loading !== null}
        className={`${baseBtn} ${artistBtn} w-full`}
      >
        {loading === "artist_pro" ? "Opening..." : "Become Artist"}
      </button>
    </div>
  );
}