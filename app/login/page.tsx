"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [welcome, setWelcome] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    setWelcome(params.get("welcome"));
    setInvite(params.get("invite"));
  }, []);

  const handleLogin = async () => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";

    let redirectTo = `${origin}/account`;

    if (welcome === "founding") {
      redirectTo = invite
        ? `${origin}/account?welcome=founding&invite=${encodeURIComponent(invite)}`
        : `${origin}/account?welcome=founding`;
    }

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });
  };

  return (
    <div className="mx-auto max-w-md p-6 pb-32 text-center">
      <h1 className="mb-6 text-3xl font-bold text-white">Welcome to SoundioX</h1>

      <button
        onClick={handleLogin}
        className="w-full rounded-xl bg-gradient-to-r from-cyan-400 to-purple-500 px-6 py-3 font-semibold text-white"
      >
        Continue with Google
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