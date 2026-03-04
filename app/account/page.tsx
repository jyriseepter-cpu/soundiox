"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function AccountPage() {
  const params = useSearchParams();
  const status = params.get("checkout");

  const message = useMemo(() => {
    if (status === "success") return "✅ Payment successful!";
    if (status === "cancel") return "Cancelled. You can try again anytime.";
    return null;
  }, [status]);

  const [email, setEmail] = useState("");

  async function openPortal() {
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data?.error || "Portal failed");
        return;
      }
      if (data?.url) window.location.href = data.url;
    } catch (e: any) {
      alert(e?.message || "Portal failed");
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-10">
      <h1 className="text-3xl font-semibold text-white">Account</h1>

      {message ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
          {message}
        </div>
      ) : null}

      <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
        <div className="text-sm font-semibold text-white">Manage plan</div>
        <div className="mt-2 text-sm text-white/70">
          Enter your email to open Stripe billing portal (sandbox).
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            className="h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/20"
          />
          <button
            onClick={openPortal}
            className="h-10 rounded-xl bg-white/10 px-4 text-sm font-medium text-white hover:bg-white/15"
          >
            Manage billing
          </button>
        </div>
      </div>
    </div>
  );
}