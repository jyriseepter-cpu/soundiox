export const LIFETIME_CAMPAIGN_END = "2026-04-05T23:59:00+03:00";

function formatCampaignEndLabel(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Tallinn",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));

  const lookup = new Map(parts.map((part) => [part.type, part.value]));

  return `${lookup.get("month")} ${lookup.get("day")}, ${lookup.get("year")} at ${lookup.get("hour")}:${lookup.get("minute")}`;
}

export const LIFETIME_CAMPAIGN_END_LABEL = formatCampaignEndLabel(
  LIFETIME_CAMPAIGN_END
);

export type AccessPlan = "free" | "premium" | "artist" | "lifetime";
export type CampaignLifetimeSource = "launch_campaign";

export type CampaignProfileState = {
  id?: string | null;
  email?: string | null;
  role?: string | null;
  plan?: string | null;
  is_founding?: boolean | null;
  lifetime_access?: boolean | null;
  lifetime_granted_at?: string | null;
  lifetime_source?: string | null;
  display_name?: string | null;
  bio?: string | null;
  country?: string | null;
  avatar_url?: string | null;
  slug?: string | null;
};

export function isLifetimeCampaignActive(now = new Date()) {
  return now.getTime() <= new Date(LIFETIME_CAMPAIGN_END).getTime();
}

export function normalizeAccessPlan(value: string | null | undefined): AccessPlan {
  if (value === "premium") return "premium";
  if (value === "artist") return "artist";
  if (value === "lifetime") return "lifetime";
  return "free";
}

export function shouldGrantLifetimeCampaignPlan(params: {
  plan: string | null | undefined;
  isFounding: boolean | null | undefined;
  now?: Date;
}) {
  const currentPlan = normalizeAccessPlan(params.plan);

  if (params.isFounding) {
    return false;
  }

  if (
    currentPlan === "premium" ||
    currentPlan === "artist" ||
    currentPlan === "lifetime"
  ) {
    return false;
  }

  return isLifetimeCampaignActive(params.now);
}

export function hasLaunchCampaignLifetimeAccess(
  profile: Pick<
    CampaignProfileState,
    "lifetime_access" | "lifetime_source"
  > | null | undefined
) {
  return (
    Boolean(profile?.lifetime_access) &&
    String(profile?.lifetime_source || "").trim() === "launch_campaign"
  );
}

export function needsLaunchCampaignArtistBackfill(
  profile: CampaignProfileState | null | undefined
) {
  if (!hasLaunchCampaignLifetimeAccess(profile)) {
    return false;
  }

  return profile?.role !== "artist" || profile?.plan !== "lifetime";
}

function assignIfDefined(
  target: Record<string, unknown>,
  key: string,
  primary: unknown,
  fallback?: unknown
) {
  if (typeof primary !== "undefined") {
    target[key] = primary;
    return;
  }

  if (typeof fallback !== "undefined") {
    target[key] = fallback;
  }
}

export async function applyLaunchCampaignArtistAccess(params: {
  supabase: any;
  userId: string;
  profile?: CampaignProfileState;
  now?: Date;
}) {
  const { supabase, userId, profile, now = new Date() } = params;

  const { data: existingProfile, error: existingError } = await supabase
    .from("profiles")
    .select(
      "id, email, role, plan, is_founding, lifetime_access, lifetime_granted_at, lifetime_source, display_name, bio, country, avatar_url, slug"
    )
    .eq("id", userId)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  const existing = existingProfile ?? null;

  if (existing?.is_founding) {
    return existing;
  }

  const nowIso = now.toISOString();
  const payload: Record<string, unknown> = {
    id: userId,
    role: "artist",
    plan: "lifetime",
    lifetime_access: true,
    lifetime_granted_at: existing?.lifetime_granted_at || nowIso,
    lifetime_source: "launch_campaign",
  };

  assignIfDefined(payload, "email", profile?.email, existing?.email);
  assignIfDefined(payload, "display_name", profile?.display_name, existing?.display_name);
  assignIfDefined(payload, "bio", profile?.bio, existing?.bio);
  assignIfDefined(payload, "country", profile?.country, existing?.country);
  assignIfDefined(payload, "avatar_url", profile?.avatar_url, existing?.avatar_url);
  assignIfDefined(payload, "slug", profile?.slug, existing?.slug);

  const { data: updatedProfile, error: upsertError } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "id" })
    .select(
      "id, email, role, plan, is_founding, lifetime_access, lifetime_granted_at, lifetime_source, display_name, bio, country, avatar_url, slug"
    )
    .single();

  if (upsertError) {
    throw upsertError;
  }

  return updatedProfile;
}
