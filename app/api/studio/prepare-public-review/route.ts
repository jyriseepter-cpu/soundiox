import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type PreparePublicReviewBody = {
  trackId?: string;
};

function getBearerToken(header: string | null) {
  if (!header) return null;

  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return null;

  return header.slice(prefix.length).trim() || null;
}

function readRequiredEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return { supabaseUrl, anonKey, serviceRoleKey };
}

function buildAuthClient(supabaseUrl: string, anonKey: string) {
  return createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function buildServiceClient(supabaseUrl: string, serviceRoleKey: string) {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const { supabaseUrl, anonKey, serviceRoleKey } = readRequiredEnv();
    const accessToken = getBearerToken(request.headers.get("authorization"));

    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authClient = buildAuthClient(supabaseUrl, anonKey);
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { error: userError?.message || "Invalid user session" },
        { status: 401 }
      );
    }

    const body = (await request.json().catch(() => null)) as PreparePublicReviewBody | null;
    const trackId = String(body?.trackId || "").trim();

    if (!trackId) {
      return NextResponse.json({ error: "trackId is required" }, { status: 400 });
    }

    const serviceClient = buildServiceClient(supabaseUrl, serviceRoleKey);

    console.log(
      "PREPARE REVIEW PAYLOAD",
      JSON.stringify(
        {
          trackId,
          userId: user.id,
          ready_for_review: true,
          review_status: "ready",
          will_publish: false,
        },
        null,
        2
      )
    );

    const { data: track, error } = await serviceClient
      .from("tracks")
      .update({
        ready_for_review: true,
        review_status: "ready",
        review_requested_at: new Date().toISOString(),
      })
      .eq("id", trackId)
      .eq("user_id", user.id)
      .eq("is_published", false)
      .select("id,title,ready_for_review,review_status,review_requested_at,is_published")
      .maybeSingle<{
        id: string;
        title: string | null;
        ready_for_review: boolean | null;
        review_status: string | null;
        review_requested_at: string | null;
        is_published: boolean | null;
      }>();

    if (error) {
      console.error("Studio public review update error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!track) {
      return NextResponse.json(
        { error: "Draft track not found or already published" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      trackId: track.id,
      title: track.title,
      readyForReview: Boolean(track.ready_for_review),
      reviewStatus: track.review_status,
      reviewRequestedAt: track.review_requested_at,
      isPublished: Boolean(track.is_published),
    });
  } catch (error: any) {
    console.error("Studio public review unexpected error:", error);
    return NextResponse.json(
      { error: error?.message || "Unexpected public review error" },
      { status: 500 }
    );
  }
}
