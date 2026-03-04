"use client";

import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <div className="mx-auto max-w-md p-6 pb-32 text-center">
      <h1 className="text-3xl font-bold mb-6 text-white">Welcome to SoundioX</h1>

      <button
        onClick={handleLogin}
        className="w-full rounded-xl bg-gradient-to-r from-cyan-400 to-purple-500 px-6 py-3 text-white font-semibold"
      >
        Continue with Google
      </button>

      {/* CONSENT TEXT */}
      <p className="text-xs text-white/50 mt-6 leading-relaxed">
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