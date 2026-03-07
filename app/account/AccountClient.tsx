"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function AccountClient() {
  const params = useSearchParams();
  const status = params.get("checkout");

  const message = useMemo(() => {
    if (status === "success") return "✅ Payment successful!";
    if (status === "cancel") return "Cancelled. You can try again anytime.";
    return null;
  }, [status]);

  const [email, setEmail] = useState("");
  const [loadingPortal, setLoadingPortal] = useState(false);

  async function openPortal() {
    try {
      if (!email.trim()) {
        alert("Please enter your email first.");
        return;
      }

      setLoadingPortal(true);

      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Portal failed");
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
      } else {
        alert("Portal URL missing");
      }
    } catch (err: any) {
      alert(err?.message || "Portal failed");
    } finally {
      setLoadingPortal(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10 text-white">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
        <h1 className="text-3xl font-semibold">Account</h1>
        <p className="mt-2 text-sm text-white/70">
          Manage your SoundioX subscription and billing.
        </p>

        {message && (
          <div className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
            {message}
          </div>
        )}

        <div className="mt-8">
          <label className="mb-2 block text-sm text-white/80">
            Your billing email
          </label>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none placeholder:text-white/35"
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={openPortal}
            disabled={loadingPortal}
            className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingPortal ? "Opening..." : "Open billing portal"}
          </button>
        </div>
      </div>
    </main>
  );
}