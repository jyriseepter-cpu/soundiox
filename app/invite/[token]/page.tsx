"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();

  const token = typeof params.token === "string" ? params.token : "";

  useEffect(() => {
    async function handleInvite() {
      if (!token) {
        router.replace("/login?invite_error=missing_token");
        return;
      }

      try {
        if (typeof window !== "undefined") {
          localStorage.setItem("soundiox_invite_token", token);
          sessionStorage.setItem("soundiox_invite_token", token);
        }

        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          router.replace(`/login?invite=${encodeURIComponent(token)}&invite_error=session`);
          return;
        }

        if (session?.user) {
          router.replace(
            `/account?welcome=founding&invite=${encodeURIComponent(token)}&claim_invite=1`
          );
          return;
        }

        router.replace(
          `/login?welcome=founding&invite=${encodeURIComponent(token)}`
        );
      } catch {
        router.replace(
          `/login?invite=${encodeURIComponent(token)}&invite_error=unexpected`
        );
      }
    }

    void handleInvite();
  }, [token, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070b14] px-6 text-white">
      <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-5 text-sm text-white/75 backdrop-blur-xl">
        Processing invite...
      </div>
    </div>
  );
}