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
      if (data?.url) window.location.href = data.url;
    } catch (e: any) {
      alert(e?.message || "Checkout failed");
    } finally {
      setLoading(null);
    }
  }

  const baseBtn =
    "h-10 rounded-xl px-4 text-sm font-semibold disabled:opacity-60";
  const