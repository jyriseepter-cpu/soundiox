"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type InviteRow = {
  id: string;
  token: string;
  email: string | null;
  role: string | null;
  is_founding: boolean | null;
  used: boolean | null;
  created_at: string | null;
};

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();

  const token = typeof params.token === "string" ? params.token : "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function checkInvite() {
      if (!token) {
        if (mounted) {
          setError("Invite token is missing.");
          setLoading(false);
        }
        return;
      }

      try {
        const { data, error } = await supabase
          .from("invites")
          .select("id, token, email, role, is_founding, used, created_at")
          .eq("token", token)
          .maybeSingle<InviteRow>();

        if (error) throw error;

        if (!data) {
          if (mounted) {
            setError("Invite not found.");
            setLoading(false);
          }
          return;
        }

        if (data.used) {
          if (mounted) {
            setError("This invite has already been used.");
            setLoading(false);
          }
          return;
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          router.replace(
            `/account?welcome=founding&invite=${encodeURIComponent(token)}`
          );
          return;
        }

        router.replace(
          `/login?welcome=founding&invite=${encodeURIComponent(token)}`
        );
      } catch (err: any) {
        if (mounted) {
          setError(err?.message || "Invite check failed.");
          setLoading(false);
        }
      }
    }

    void checkInvite();

    return () => {
      mounted = false;
    };
  }, [token, router]);

  return (
    <main className="min-h-screen bg-[#07090f] px-6 py-10 text-white">
      <div className="mx-auto max-w-xl">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
          {loading ? (
            <>
              <h1 className="text-2xl font-bold">Checking your invite...</h1>
              <p className="mt-3 text-sm text-white/65">
                Please wait while we verify your Founding Artist invite.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold">Invite unavailable</h1>
              <p className="mt-3 text-sm text-rose-200">
                {error || "This invite could not be used."}
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}