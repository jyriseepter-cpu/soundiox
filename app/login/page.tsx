"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [welcome, setWelcome] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    setWelcome(params.get("welcome"));
    setInvite(params.get("invite"));
  }, []);

  const redirectTo = useMemo(() => {
    if (typeof window === "undefined") return "";

    const origin = window.location.origin;

    if (welcome === "founding") {
      return invite
        ? `${origin}/account?welcome=founding&invite=${encodeURIComponent(invite)}`
        : `${origin}/account?welcome=founding`;
    }

    return `${origin}/account`;
  }, [welcome, invite]);

  async function handleLogin() {
    try {
      setLoading(true);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            prompt: "select_account",
          },
        },
      });

      if (error) {
        alert(error.message || "Google login failed.");
      }
    } catch (err: any) {
      alert(err?.message || "Google login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md p-6 pb-32 text-center">
      <h1 className="mb-6 text-3xl font-bold text-white">Welcome to SoundioX</h1>

      {welcome === "founding" ? (
        <div className="mb-5 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
          Founding Artist invitation detected. Continue with Google to claim your invite.
        </div>
      ) : null}

      <button
        onClick={handleLogin}
        disabled={loading}
        className="w-full rounded-xl bg-gradient-to-r from-cyan-400 to-purple-500 px-6 py-3 font-semibold text-white disabled:opacity-60"
      >
        {loading ? "Opening Google..." : "Continue with Google"}
      </button>

      <p className="mt-6 text-xs leading-relaxed text-white/50">
        By continuing, you agree to our{" "}
        <a href="/legal/terms" className="underline hover:text-white">
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="/legal/privacy" className="underline hover:text-white">
          Privacy Policy
        </a>
        .
      </p>
    </div>
  );
}