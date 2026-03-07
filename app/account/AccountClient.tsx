"use client";

import { useEffect, useMemo, useState } from "react";
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
      setLoadingPortal(true);

      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email })
      });

      const data = await res.json();

      if (data?.url) {
        window.location.href = data.url;
      }
    } finally {
      setLoadingPortal(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Account</h1>

      {message && (
        <div className="mt-4 rounded-xl bg-green-500/10 p-3">
          {message}
        </div>
      )}

      <input
        className="mt-6 w-full rounded-xl border p-3"
        placeholder="your@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <button
        onClick={openPortal}
        disabled={loadingPortal}
        className="mt-4 rounded-xl bg-white px-4 py-2 text-black"
      >
        {loadingPortal ? "Opening..." : "Open billing portal"}
      </button>
    </main>
  );
}