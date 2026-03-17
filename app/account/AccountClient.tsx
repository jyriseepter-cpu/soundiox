"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type ProfileRow = {
  id: string;
  email?: string | null;
  role: string | null;
  display_name: string | null;
  bio: string | null;
  country: string | null;
  avatar_url: string | null;
  slug: string | null;
  plan: string | null;
  is_founding: boolean | null;
  created_at?: string | null;
};

type FollowRow = {
  following_profile_id: string;
  created_at: string | null;
};

type FollowingProfileRow = {
  id: string;
  display_name: string | null;
  slug: string | null;
  avatar_url: string | null;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function getAvatarUrl(value: string | null | undefined) {
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("/")) return value;
  return value;
}

function getCookieValue(name: string) {
  if (typeof document === "undefined") return null;

  const cookies = document.cookie ? document.cookie.split("; ") : [];

  for (const cookie of cookies) {
    const [key, ...rest] = cookie.split("=");
    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return null;
}

function setInviteCookie(token: string) {
  if (typeof document === "undefined") return;
  document.cookie = `soundiox_invite_token=${encodeURIComponent(token)}; path=/; max-age=3600; samesite=lax`;
}

function deleteInviteCookie() {
  if (typeof document === "undefined") return;
  document.cookie = "soundiox_invite_token=; path=/; max-age=0; samesite=lax";
}

function normalizeProfilePlan(value: string | null | undefined) {
  if (value === "premium") return "premium";
  return "free";
}

export default function AccountClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inviteHandledRef = useRef(false);

  const selectedPlan = searchParams.get("plan");
  const checkoutStatus = searchParams.get("checkout");
  const welcome = searchParams.get("welcome");
  const inviteToken = searchParams.get("invite");

  const hasFoundingInvite = welcome === "founding";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [claimingInvite, setClaimingInvite] = useState(false);

  const [userId, setUserId] = useState<string>("");
  const [email, setEmail] = useState<string>("");

  const [isArtistAccount, setIsArtistAccount] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [country, setCountry] = useState("");
  const [slug, setSlug] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [plan, setPlan] = useState("free");
  const [isFounding, setIsFounding] = useState(false);
  const [followingCount, setFollowingCount] = useState(0);
  const [followingProfiles, setFollowingProfiles] = useState<FollowingProfileRow[]>([]);
  const [loadingFollowing, setLoadingFollowing] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const profileUrl = useMemo(() => {
    if (!slug) return "";
    return `/artists/${slug}`;
  }, [slug]);

  async function loadProfile(user: any, options?: { skipCreate?: boolean }) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "id, email, role, display_name, bio, country, avatar_url, slug, plan, is_founding, created_at"
      )
      .eq("id", user.id)
      .maybeSingle<ProfileRow>();

    if (profileError) {
      throw profileError;
    }

    const defaultDisplayName = "AI Artist";
    const defaultSlug = `artist-${String(user.id || "").slice(0, 8)}`;

    const nextDisplayName = profile?.display_name || defaultDisplayName;
    const nextSlug = profile?.slug || defaultSlug;

    const nextIsArtist = profile?.role === "artist";

    setIsArtistAccount(nextIsArtist);
    setDisplayName(nextDisplayName);
    setBio(profile?.bio || "");
    setCountry(profile?.country || "");
    setSlug(nextSlug);
    setAvatarUrl(profile?.avatar_url || "");
    setPlan(normalizeProfilePlan(profile?.plan));
    setIsFounding(Boolean(profile?.is_founding));

    if (!profile && !options?.skipCreate) {
      const insertPayload = {
        id: user.id,
        email: user.email ?? null,
        role: "listener",
        display_name: nextDisplayName,
        bio: null,
        country: null,
        avatar_url: null,
        slug: nextSlug,
        plan: "free",
        is_founding: false,
      };

      const { error: insertError } = await supabase
        .from("profiles")
        .upsert(insertPayload, { onConflict: "id" });

      if (insertError) {
        throw insertError;
      }

      setIsArtistAccount(false);
      setDisplayName(nextDisplayName);
      setBio("");
      setCountry("");
      setSlug(nextSlug);
      setAvatarUrl("");
      setPlan("free");
      setIsFounding(false);
    }
  }

  async function loadFollowing(userProfileId: string) {
    setLoadingFollowing(true);

    try {
      const { data: followRows, error: followsError } = await supabase
        .from("follows")
        .select("following_profile_id, created_at")
        .eq("follower_id", userProfileId)
        .order("created_at", { ascending: false });

      if (followsError) {
        throw followsError;
      }

      const rows = (followRows ?? []) as FollowRow[];
      setFollowingCount(rows.length);

      const followedIds = rows
        .map((row) => row.following_profile_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0);

      if (!followedIds.length) {
        setFollowingProfiles([]);
        return;
      }

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, display_name, slug, avatar_url")
        .in("id", followedIds);

      if (profilesError) {
        throw profilesError;
      }

      const profileMap = new Map(
        ((profiles ?? []) as FollowingProfileRow[]).map((profile) => [profile.id, profile])
      );

      const orderedProfiles = followedIds
        .map((id) => profileMap.get(id))
        .filter((profile): profile is FollowingProfileRow => Boolean(profile));

      setFollowingProfiles(orderedProfiles);
    } catch (err) {
      console.error("following load error:", err);
      setFollowingCount(0);
      setFollowingProfiles([]);
    } finally {
      setLoadingFollowing(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function loadAccount() {
      setLoading(true);
      setError("");
      setMessage("");

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;

        if (!user) {
          router.replace("/login");
          return;
        }

        if (!mounted) return;

        setUserId(user.id);
        setEmail(user.email ?? "");

        await loadProfile(user, { skipCreate: hasFoundingInvite });
        await loadFollowing(user.id);
      } catch (err: any) {
        setError(err?.message || "Account page failed to load.");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadAccount();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        router.replace("/login");
        return;
      }

      setUserId(session.user.id);
      setEmail(session.user.email ?? "");
      void loadFollowing(session.user.id);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router, hasFoundingInvite]);

  useEffect(() => {
    if (!selectedPlan) return;

    if (selectedPlan === "premium") {
      setMessage("Premium plan selected. Complete checkout to activate it.");
    }
  }, [selectedPlan]);

  useEffect(() => {
    if (!checkoutStatus) return;

    if (checkoutStatus === "success") {
      setMessage("Checkout completed successfully.");
      setError("");
    }

    if (checkoutStatus === "cancel") {
      setError("Checkout was cancelled.");
    }
  }, [checkoutStatus]);

  useEffect(() => {
    let mounted = true;

    async function claimFoundingInvite() {
      if (!hasFoundingInvite) return;
      if (inviteHandledRef.current) return;

      const pendingInviteToken = (inviteToken || getCookieValue("soundiox_invite_token") || "").trim();

      if (!pendingInviteToken) return;

      inviteHandledRef.current = true;
      setClaimingInvite(true);
      setError("");

      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (!session?.user || !session.access_token) {
          throw new Error("Please log in first.");
        }

        setInviteCookie(pendingInviteToken);

        const res = await fetch("/api/founding/claim", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ inviteToken: pendingInviteToken }),
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(data?.error || "Founding invite claim failed.");
        }

        if (!mounted) return;

        deleteInviteCookie();
        await loadProfile(session.user);
        await loadFollowing(session.user.id);
        setMessage("Welcome, Founding Artist.");
        router.replace("/account?welcome=founding");
      } catch (err: any) {
        if (!mounted) return;
        inviteHandledRef.current = false;
        setError(err?.message || "Founding invite claim failed.");
      } finally {
        if (mounted) {
          setClaimingInvite(false);
        }
      }
    }

    void claimFoundingInvite();

    return () => {
      mounted = false;
    };
  }, [hasFoundingInvite, inviteToken, router]);

  async function handleSave() {
    if (!userId) return;

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const cleanDisplayName = displayName.trim();
      const cleanBio = bio.trim();
      const cleanCountry = country.trim();
      const cleanSlug = slugify(slug || displayName || "artist");

      if (!cleanDisplayName) {
        throw new Error("Display name is required.");
      }

      const { data: existingSlug, error: slugError } = await supabase
        .from("profiles")
        .select("id")
        .eq("slug", cleanSlug)
        .neq("id", userId)
        .maybeSingle();

      if (slugError) throw slugError;

      if (existingSlug) {
        throw new Error("That profile URL is already taken.");
      }

      const payload = {
        id: userId,
        email: email || null,
        display_name: cleanDisplayName,
        bio: cleanBio || null,
        country: cleanCountry || null,
        avatar_url: avatarUrl || null,
        slug: cleanSlug || null,
      };

      const { error: saveError } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" });

      if (saveError) throw saveError;

      setSlug(cleanSlug);
      setMessage("Profile saved.");
    } catch (err: any) {
      setError(err?.message || "Saving failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarChange(file: File | null) {
    if (!file || !userId) return;

    setUploadingAvatar(true);
    setMessage("");
    setError("");

    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${userId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = data?.publicUrl || "";

      if (!publicUrl) {
        throw new Error("Could not create avatar URL.");
      }

      setAvatarUrl(publicUrl);

      const { error: updateError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: userId,
            avatar_url: publicUrl,
          },
          { onConflict: "id" }
        );

      if (updateError) throw updateError;

      setMessage("Avatar uploaded.");
    } catch (err: any) {
      setError(err?.message || "Avatar upload failed.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleLogout() {
    setError("");
    setMessage("");

    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#07090f] px-6 py-10 text-white">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
            <p className="text-sm text-white/70">Loading account...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07090f] px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.16),transparent_35%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.16),transparent_35%),rgba(255,255,255,0.04)] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative h-20 w-20 overflow-hidden rounded-2xl border border-white/15 bg-white/10">
                {avatarUrl ? (
                  <Image
                    src={getAvatarUrl(avatarUrl)}
                    alt="Avatar"
                    fill
                    className="object-cover"
                    sizes="80px"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-white/70">
                    {(displayName || "A").charAt(0).toUpperCase()}
                  </div>
                )}

                {isFounding ? (
                  <div className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-cyan-300/70" />
                ) : null}
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight">
                    {displayName || "Your account"}
                  </h1>

                  {isFounding ? (
                    <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
                      Founding Artist
                    </span>
                  ) : null}

                  {isArtistAccount && !isFounding ? (
                    <span className="rounded-full border border-fuchsia-300/30 bg-fuchsia-400/10 px-3 py-1 text-xs font-medium text-fuchsia-200">
                      Artist
                    </span>
                  ) : null}
                </div>

                <p className="mt-1 text-sm text-white/65">{email}</p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm text-white transition hover:bg-white/12"
                  >
                    {uploadingAvatar ? "Uploading..." : "Upload avatar"}
                  </button>

                  {profileUrl ? (
                    <Link
                      href={profileUrl}
                      className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm text-white transition hover:bg-white/12"
                    >
                      View public profile
                    </Link>
                  ) : null}

                  <Link
                    href="/upload"
                    className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100 transition hover:bg-cyan-400/15"
                  >
                    Upload track
                  </Link>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm text-white transition hover:bg-white/12"
                  >
                    Log out
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleAvatarChange(e.target.files?.[0] || null)}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/75">
              <div>
                <span className="text-white/45">Plan:</span>{" "}
                <span className="font-medium text-white">{plan}</span>
              </div>
            </div>
          </div>
        </section>

        {claimingInvite ? (
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-200">
            Activating Founding Artist invite...
          </div>
        ) : null}

        {message ? (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
            <h2 className="text-lg font-semibold text-white">Profile settings</h2>
            <p className="mt-1 text-sm text-white/60">
              Edit your public profile.
            </p>

            <div className="mt-6 space-y-5">
              <div>
                <label className="mb-2 block text-sm text-white/75">
                  Display name
                </label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="AI Artist"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/6 px-4 text-white outline-none transition placeholder:text-white/30 focus:border-cyan-300/40"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-white/75">Country</label>
                <input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Estonia"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/6 px-4 text-white outline-none transition placeholder:text-white/30 focus:border-cyan-300/40"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-white/75">
                  Public profile URL
                </label>
                <div className="flex items-center rounded-2xl border border-white/10 bg-white/6 px-4">
                  <span className="mr-2 text-sm text-white/35">/artists/</span>
                  <input
                    value={slug}
                    onChange={(e) => setSlug(slugify(e.target.value))}
                    placeholder="ai-artist"
                    className="h-12 w-full bg-transparent text-white outline-none placeholder:text-white/30"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm text-white/75">Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell listeners who you are..."
                  rows={6}
                  className="w-full rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-cyan-300/40"
                />
              </div>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex h-12 items-center justify-center rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-6 text-sm font-medium text-white transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save profile"}
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
              <h2 className="text-lg font-semibold text-white">Status</h2>

              <div className="mt-5 space-y-3 text-sm text-white/75">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-white/45">Founding</div>
                  <div className="mt-1 font-medium text-white">
                    {isFounding ? "Active" : "Not active"}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-white/45">Plan</div>
                  <div className="mt-1 font-medium text-white">
                    {plan === "premium" ? "Premium" : "Free"}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-white/45">Profile link</div>
                  <div className="mt-1 break-all font-medium text-white">
                    {profileUrl || "Create a slug to activate"}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-white/45">Following</div>
                  <div className="mt-1 font-medium text-white">{followingCount}</div>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
              <h2 className="text-lg font-semibold text-white">Following</h2>
              <p className="mt-2 text-sm text-white/65">
                Profiles you follow for quick return visits.
              </p>

              <div className="mt-5 space-y-3">
                {loadingFollowing ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
                    Loading followed profiles...
                  </div>
                ) : followingProfiles.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
                    You are not following any profiles yet.
                  </div>
                ) : (
                  followingProfiles.map((profile) => (
                    <Link
                      key={profile.id}
                      href={profile.slug ? `/artists/${profile.slug}` : "#"}
                      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 transition hover:bg-black/30"
                    >
                      <div className="relative h-11 w-11 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                        {profile.avatar_url ? (
                          <Image
                            src={getAvatarUrl(profile.avatar_url)}
                            alt={profile.display_name || "Profile"}
                            fill
                            className="object-cover"
                            sizes="44px"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-white/50">
                            {(profile.display_name || "P").charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-white">
                          {profile.display_name || "Profile"}
                        </div>
                        <div className="truncate text-xs text-white/55">
                          {profile.slug ? `/artists/${profile.slug}` : "Profile link unavailable"}
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
              <h2 className="text-lg font-semibold text-white">Upload track</h2>
              <p className="mt-2 text-sm text-white/65">
                Publish a new song to your SoundioX profile and discovery feed.
              </p>

              <div className="mt-5 space-y-3">
                <Link
                  href="/upload"
                  className="inline-flex h-12 w-full items-center justify-center rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-6 text-sm font-medium text-white transition hover:scale-[1.01]"
                >
                  Open upload page
                </Link>

                <p className="text-xs leading-6 text-white/45">
                  Upload audio, cover art, title and genre to publish a new track.
                </p>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
