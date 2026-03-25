"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  applyLaunchCampaignArtistAccess,
  needsLaunchCampaignArtistBackfill,
  shouldGrantLifetimeCampaignPlan,
} from "@/lib/lifetimeCampaign";

type ProfileRow = {
  id: string;
  role: string | null;
  slug: string | null;
  display_name: string | null;
  plan?: string | null;
  is_founding?: boolean | null;
  lifetime_access?: boolean | null;
  lifetime_granted_at?: string | null;
  lifetime_source?: string | null;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

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
          .select(
            "id, role, slug, display_name, plan, is_founding, lifetime_access, lifetime_granted_at, lifetime_source"
          )
          .eq("id", user.id)
          .maybeSingle<ProfileRow>();

        let effectiveProfile = profileRow ?? null;

        if (!effectiveProfile) {
          const emailFallback =
            typeof user.email === "string" && user.email.includes("@")
              ? user.email.split("@")[0]
              : null;
          const displayName = emailFallback || "AI Artist";
          const slug = slugify(displayName) || `artist-${user.id.slice(0, 8)}`;
          const defaultPlan = shouldGrantLifetimeCampaignPlan({
            plan: null,
            isFounding: false,
          })
            ? "lifetime"
            : "free";

          const insertPayload = {
            id: user.id,
            role: "listener",
            slug,
            display_name: displayName,
            plan: defaultPlan,
            is_founding: false,
          };

          const { data: insertedProfile, error: insertError } = await supabase
            .from("profiles")
            .upsert(insertPayload, { onConflict: "id" })
            .select("id, role, slug, display_name, plan, is_founding")
            .single<ProfileRow>();

          if (insertError) {
            console.error("header profile bootstrap error:", insertError);
          } else {
            effectiveProfile = insertedProfile;
          }
        } else if (needsLaunchCampaignArtistBackfill(effectiveProfile)) {
          const backfilledProfile = await applyLaunchCampaignArtistAccess({
            supabase,
            userId: user.id,
            profile: {
              email: user.email ?? null,
              display_name: effectiveProfile.display_name,
              slug: effectiveProfile.slug,
            },
          });

          effectiveProfile = backfilledProfile as ProfileRow;
        } else if (
          shouldGrantLifetimeCampaignPlan({
            plan: effectiveProfile.plan,
            isFounding: effectiveProfile.is_founding,
          })
        ) {
          const { data: upgradedProfile, error: upgradeError } = await supabase
            .from("profiles")
            .update({ plan: "lifetime" })
            .eq("id", user.id)
            .select("id, role, slug, display_name, plan, is_founding")
            .single<ProfileRow>();

          if (upgradeError) {
            console.error("header lifetime campaign update error:", upgradeError);
          } else {
            effectiveProfile = upgradedProfile;
          }
        }

        if (mounted) {
          setProfile(effectiveProfile ?? null);
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
    <header className="relative z-40 px-4 py-4 sm:px-6 sm:py-6 lg:px-6 lg:py-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 rounded-[10px] border border-white/10 bg-[linear-gradient(90deg,rgba(34,211,238,0.18),rgba(99,102,241,0.14),rgba(217,70,239,0.18))] px-4 py-4 shadow-[0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl landscape:flex-row landscape:items-center landscape:justify-between landscape:gap-3 landscape:py-3 sm:px-5 sm:py-5 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div className="flex items-center justify-between gap-3 landscape:min-w-0 lg:min-w-0">
            <Link href="/" className="flex min-w-0 items-center gap-3">
              <Image
                src="/logo-new.png"
                alt="SoundioX"
                width={52}
                height={52}
                className="h-11 w-11 object-contain landscape:h-10 landscape:w-10 sm:h-12 sm:w-12"
                priority
              />
              <span className="whitespace-nowrap text-lg font-bold tracking-wide text-white landscape:text-base sm:text-xl">
                SoundioX
              </span>
            </Link>
          </div>

          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm landscape:flex-nowrap landscape:justify-center landscape:gap-4 landscape:text-[13px] sm:text-base lg:flex-1 lg:justify-center lg:gap-10">
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

          <div className="flex flex-wrap items-center gap-2 landscape:flex-nowrap landscape:justify-end landscape:gap-2 sm:gap-3 lg:justify-end">
            {loading ? (
              <div className="text-sm text-white/60 landscape:text-xs">Loading...</div>
            ) : profile ? (
              <>
                <button
                  type="button"
                  onClick={handleAccount}
                  className="rounded-lg bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 landscape:px-3 landscape:py-1.5 landscape:text-xs sm:px-5"
                >
                  {profile.display_name?.trim() || "Account"}
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="rounded-lg border border-white/15 bg-black/20 px-4 py-2 text-sm font-bold text-white/90 transition hover:bg-white/10 disabled:opacity-60 landscape:px-3 landscape:py-1.5 landscape:text-xs"
                >
                  {loggingOut ? "Logging out..." : "Log out"}
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="rounded-lg bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 landscape:px-3 landscape:py-1.5 landscape:text-xs sm:px-5"
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
