import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type PlanValue = "free" | "premium" | "artist_pro";

type WebhookContext = {
  stripe: Stripe;
  webhookSecret: string;
  supabase: any;
  premiumPriceId: string;
  artistProPriceId: string;
};

function requiredEnv(name: string) {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : null;
}

function getWebhookContext(): WebhookContext {
  const stripeSecretKey = requiredEnv("STRIPE_SECRET_KEY");
  const webhookSecret = requiredEnv("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseServiceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const premiumPriceId = requiredEnv("STRIPE_PREMIUM_PRICE_ID");
  const artistProPriceId = requiredEnv("STRIPE_ARTIST_PRO_PRICE_ID");

  if (!stripeSecretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY");
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
    throw new Error("Missing STRIPE_PREMIUM_PRICE_ID");
  }
  if (!artistProPriceId) {
    throw new Error("Missing STRIPE_ARTIST_PRO_PRICE_ID");
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
    artistProPriceId,
  };
}

function planFromPriceId(
  priceId: string | null,
  context: WebhookContext
): PlanValue | null {
  if (!priceId) return null;
  if (priceId === context.premiumPriceId) return "premium";
  if (priceId === context.artistProPriceId) return "artist_pro";
  return null;
}

async function updateProfile(params: {
  context: WebhookContext;
  userId: string;
  plan: PlanValue;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}) {
  const { context, userId, plan, stripeCustomerId, stripeSubscriptionId } = params;

  const payload = {
    id: userId,
    plan,
    is_pro: plan === "artist_pro",
    stripe_customer_id: stripeCustomerId || null,
    stripe_subscription_id: stripeSubscriptionId || null,
  };

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
    .select("id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
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

  const { data: profile, error } = await context.supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!profile?.id) {
    console.warn("No profile found for deleted subscription customer", {
      stripeCustomerId,
    });
    return;
  }

  await updateProfile({
    context,
    userId: profile.id,
    plan: "free",
    stripeCustomerId,
    stripeSubscriptionId: null,
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
