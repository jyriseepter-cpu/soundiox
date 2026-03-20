export const LIFETIME_CAMPAIGN_END = "2026-03-22T23:59:59Z";

export type AccessPlan = "free" | "premium" | "artist" | "lifetime";

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
