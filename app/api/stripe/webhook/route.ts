import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type PlanValue = "free" | "premium" | "artist";

type WebhookContext = {
  stripe: Stripe;
  webhookSecret: string;
  supabase: any;
  premiumPriceId: string;
  artistPriceId: string;
};

type ProfileAccessRow = {
  id: string;
  role: string | null;
  is_founding: boolean | null;
};

function readEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function getWebhookContext(): WebhookContext {
  const stripeSecretKey = readEnv("STRIPE_SECRET_KEY", "STRIPE_SECRET_KEY_LIVE");
  const webhookSecret = readEnv("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseServiceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  const premiumPriceId = readEnv("STRIPE_PREMIUM_PRICE_ID", "PREMIUM_PRICE_ID");
  const artistPriceId = readEnv(
    "STRIPE_ARTIST_PRICE_ID",
    "STRIPE_ARTIST_PRO_PRICE_ID",
    "ARTIST_PRO_PRICE_ID"
  );

  if (!stripeSecretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY or STRIPE_SECRET_KEY_LIVE");
  }
  if (!webhookSecret) {
    throw new Error("Missing STRIPE_WEBHOOK_SECRET");
  }
  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!supabaseServiceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!premiumPriceId) {
    throw new Error("Missing STRIPE_PREMIUM_PRICE_ID or PREMIUM_PRICE_ID");
  }
  if (!artistPriceId) {
    throw new Error(
      "Missing STRIPE_ARTIST_PRICE_ID or STRIPE_ARTIST_PRO_PRICE_ID or ARTIST_PRO_PRICE_ID"
    );
  }

  return {
    stripe: new Stripe(stripeSecretKey),
    webhookSecret,
    supabase: createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }),
    premiumPriceId,
    artistPriceId,
  };
}

function planFromPriceId(
  priceId: string | null,
  context: WebhookContext
): PlanValue | null {
  if (!priceId) return null;
  if (priceId === context.premiumPriceId) return "premium";
  if (priceId === context.artistPriceId) return "artist";
  return null;
}

function isAccessGranted(status: Stripe.Subscription.Status) {
  return status === "trialing" || status === "active";
}

function isDowngradeStatus(status: Stripe.Subscription.Status) {
  return (
    status === "canceled" ||
    status === "unpaid" ||
    status === "past_due" ||
    status === "incomplete_expired"
  );
}

async function updateProfile(params: {
  context: WebhookContext;
  userId: string;
  plan?: PlanValue;
  role?: "artist" | "listener";
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}) {
  const {
    context,
    userId,
    plan,
    role,
    stripeCustomerId,
    stripeSubscriptionId,
  } = params;

  const payload: Record<string, any> = {
    id: userId,
  };

  if (typeof plan !== "undefined") {
    payload.plan = plan;
  }

  if (typeof role !== "undefined") {
    payload.role = role;
  }

  if (typeof stripeCustomerId !== "undefined") {
    payload.stripe_customer_id = stripeCustomerId || null;
  }

  if (typeof stripeSubscriptionId !== "undefined") {
    payload.stripe_subscription_id = stripeSubscriptionId || null;
  }

  const { error } = await context.supabase
    .from("profiles")
    .upsert(payload, { onConflict: "id" });

  if (error) {
    throw error;
  }
}

async function getProfileByStripeCustomerId(
  stripeCustomerId: string,
  context: WebhookContext
) {
  const { data, error } = await context.supabase
    .from("profiles")
    .select("id, role, is_founding")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as ProfileAccessRow | null;
}

async function getProfileByUserId(
  userId: string,
  context: WebhookContext
): Promise<ProfileAccessRow | null> {
  const { data, error } = await context.supabase
    .from("profiles")
    .select("id, role, is_founding")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as ProfileAccessRow | null;
}

async function getSessionPriceId(
  sessionId: string,
  context: WebhookContext
): Promise<string | null> {
  const lineItems = await context.stripe.checkout.sessions.listLineItems(sessionId, {
    limit: 10,
  });

  const first = lineItems.data[0];
  const price = first?.price;

  if (!price) return null;

  if (typeof price === "string") {
    return price;
  }

  return price.id || null;
}

function getSubscriptionPriceId(subscription: Stripe.Subscription): string | null {
  const firstItem = subscription.items.data[0];
  const price = firstItem?.price;

  if (!price) return null;

  if (typeof price === "string") {
    return price;
  }

  return price.id || null;
}

async function getUserIdFromStripeCustomerId(
  stripeCustomerId: string,
  context: WebhookContext
): Promise<string | null> {
  const profile = await getProfileByStripeCustomerId(stripeCustomerId, context);
  return profile?.id ? String(profile.id) : null;
}

async function applyFreeDowngrade(params: {
  context: WebhookContext;
  userId: string;
  stripeCustomerId?: string | null;
}) {
  const { context, userId, stripeCustomerId } = params;

  const profile = await getProfileByUserId(userId, context);

  if (!profile) {
    await updateProfile({
      context,
      userId,
      plan: "free",
      role: "listener",
      stripeCustomerId,
      stripeSubscriptionId: null,
    });
    return;
  }

  if (profile.is_founding) {
    await updateProfile({
      context,
      userId,
      plan: "free",
      stripeCustomerId,
      stripeSubscriptionId: null,
    });

    return;
  }

  await updateProfile({
    context,
    userId,
    plan: "free",
    role: "listener",
    stripeCustomerId,
    stripeSubscriptionId: null,
  });
}

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  context: WebhookContext
) {
  const metadata = session.metadata || {};
  const sessionId = session.id;
  const stripeCustomerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id || null;
  const stripeSubscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id || null;

  const priceId = await getSessionPriceId(sessionId, context);
  const plan = planFromPriceId(priceId, context);

  if (!plan || plan === "free") {
    console.warn("Webhook: unknown or unsupported price id", {
      sessionId,
      priceId,
    });
    return;
  }

  const userId = String(metadata.userId || "").trim();

  if (!userId) {
    console.warn("Webhook: missing userId metadata for checkout session", {
      sessionId,
      metadata,
    });
    return;
  }

  if (stripeCustomerId) {
    const existingCustomerOwner =
      await getProfileByStripeCustomerId(stripeCustomerId, context);

    if (existingCustomerOwner?.id && existingCustomerOwner.id !== userId) {
      console.error("Webhook: stripe customer already linked to another user", {
        sessionId,
        stripeCustomerId,
        metadataUserId: userId,
        existingUserId: existingCustomerOwner.id,
      });
      return;
    }
  }

  await updateProfile({
    context,
    userId,
    plan,
    role: plan === "artist" ? "artist" : undefined,
    stripeCustomerId,
    stripeSubscriptionId,
  });

  console.log("checkout.session.completed synced profile", {
    userId,
    plan,
    priceId,
    stripeCustomerId,
    stripeSubscriptionId,
  });
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  context: WebhookContext
) {
  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id || null;
  const stripeSubscriptionId = subscription.id;
  const status = subscription.status;
  const priceId = getSubscriptionPriceId(subscription);
  const metadata = subscription.metadata || {};
  const planFromMetadata = String(metadata.plan || "").trim();
  const planFromPrice = planFromPriceId(priceId, context);
  const normalizedPlan =
    planFromMetadata === "artist" || planFromMetadata === "premium"
      ? (planFromMetadata as Extract<PlanValue, "artist" | "premium">)
      : null;
  const plan = normalizedPlan || planFromPrice;

  if (!stripeCustomerId) {
    console.warn("customer.subscription.updated missing customer id", {
      subscriptionId: stripeSubscriptionId,
      status,
    });
    return;
  }

  const metadataUserId = String(metadata.userId || "").trim() || null;
  const userId =
    metadataUserId || (await getUserIdFromStripeCustomerId(stripeCustomerId, context));

  if (!userId) {
    console.warn("No profile found for subscription update", {
      stripeCustomerId,
      stripeSubscriptionId,
      status,
    });
    return;
  }

  if (isAccessGranted(status)) {
    if (!plan || plan === "free") {
      console.warn("customer.subscription.updated missing paid plan", {
        userId,
        stripeSubscriptionId,
        status,
        priceId,
        metadata,
      });
      return;
    }

    await updateProfile({
      context,
      userId,
      plan,
      role: plan === "artist" ? "artist" : undefined,
      stripeCustomerId,
      stripeSubscriptionId,
    });

    console.log("customer.subscription.updated granted access", {
      userId,
      plan,
      stripeCustomerId,
      stripeSubscriptionId,
      status,
    });
    return;
  }

  if (isDowngradeStatus(status)) {
    await applyFreeDowngrade({
      context,
      userId,
      stripeCustomerId,
    });

    console.log("customer.subscription.updated downgraded access", {
      userId,
      stripeCustomerId,
      stripeSubscriptionId,
      status,
    });
  }
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  context: WebhookContext
) {
  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id || null;

  if (!stripeCustomerId) {
    console.warn("customer.subscription.deleted missing customer id");
    return;
  }

  const profile = await getProfileByStripeCustomerId(stripeCustomerId, context);

  if (!profile?.id) {
    console.warn("No profile found for deleted subscription customer", {
      stripeCustomerId,
    });
    return;
  }

  await applyFreeDowngrade({
    context,
    userId: profile.id,
    stripeCustomerId,
  });

  console.log("customer.subscription.deleted synced profile", {
    userId: profile.id,
    stripeCustomerId,
  });
}

export async function POST(req: Request) {
  let context: WebhookContext;

  try {
    context = getWebhookContext();
  } catch (err: any) {
    console.error("Webhook env initialization failed:", err?.message || err);
    return new Response("Webhook configuration error", { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return new Response("Missing stripe-signature", { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;

  try {
    event = context.stripe.webhooks.constructEvent(body, sig, context.webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err?.message || err);
    return new Response("Webhook Error", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session, context);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription, context);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription, context);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        console.log("invoice.payment_failed", {
          invoiceId: invoice.id,
          customer:
            typeof invoice.customer === "string"
              ? invoice.customer
              : invoice.customer?.id || null,
        });
        break;
      }

      default: {
        console.log("Unhandled event type:", event.type);
      }
    }

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return new Response("Webhook handler failed", { status: 500 });
  }
}

export async function GET() {
  return new Response("ok", { status: 200 });
}