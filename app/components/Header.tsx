"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type ProfileRow = {
  id: string;
  role: string | null;
  slug: string | null;
  display_name: string | null;
};

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadUser() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const user = session?.user ?? null;

        if (!user) {
          if (mounted) {
            setProfile(null);
            setLoading(false);
          }
          return;
        }

        const { data: profileRow } = await supabase
          .from("profiles")
          .select("id, role, slug, display_name")
          .eq("id", user.id)
          .maybeSingle();

        if (mounted) {
          setProfile(profileRow ?? null);
          setLoading(false);
        }
      } catch (error) {
        console.error("header load error:", error);
        if (mounted) {
          setProfile(null);
          setLoading(false);
        }
      }
    }

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadUser();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleLogout() {
    try {
      setLoggingOut(true);

      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error("logout error:", error);
        return;
      }

      setProfile(null);
      router.push("/");
      router.refresh();
    } catch (error) {
      console.error("logout catch error:", error);
    } finally {
      setLoggingOut(false);
    }
  }

  function handleAccount() {
    router.push("/account");
  }

  const linkClass = (href: string) =>
    `relative flex items-center gap-2 text-base font-bold transition ${
      pathname === href ? "text-white" : "text-white/75 hover:text-white"
    }`;

  return (
    <header className="relative z-40 px-6 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between rounded-[10px] border border-white/10 bg-[linear-gradient(90deg,rgba(34,211,238,0.18),rgba(99,102,241,0.14),rgba(217,70,239,0.18))] px-6 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl">

          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logo-new.png"
              alt="SoundioX"
              width={52}
              height={52}
              className="h-13 w-13 object-contain"
              priority
            />
            <span className="text-xl font-bold tracking-wide text-white">
              SoundioX
            </span>
          </Link>

          <nav className="flex items-center gap-10">
            <Link href="/discover" className={linkClass("/discover")}>
              Discover
            </Link>

            <Link href="/pulse" className={linkClass("/pulse")}>
              <span className="relative inline-flex items-center gap-2">
                <span
                  className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                    pathname === "/pulse" ? "bg-cyan-300" : "bg-cyan-400/90"
                  }`}
                >
                  <span className="absolute inset-0 rounded-full bg-cyan-300/80 animate-ping" />
                </span>
                Pulse
              </span>
            </Link>

            <Link href="/artists" className={linkClass("/artists")}>
              Artists
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            {loading ? (
              <div className="text-sm text-white/60">Loading...</div>
            ) : profile ? (
              <>
                <button
                  type="button"
                  onClick={handleAccount}
                  className="rounded-lg bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-5 py-2 text-sm font-bold text-white transition hover:opacity-90"
                >
                  {profile.display_name?.trim() || "Account"}
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="rounded-lg border border-white/15 bg-black/20 px-4 py-2 text-sm font-bold text-white/90 transition hover:bg-white/10 disabled:opacity-60"
                >
                  {loggingOut ? "Logging out..." : "Log out"}
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="rounded-lg bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-5 py-2 text-sm font-bold text-white transition hover:opacity-90"
              >
                Get Started
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}