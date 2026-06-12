import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type ReviewActionBody = {
  trackId?: string;
  note?: string;
};

const PENDING_REVIEW_STATUS_FILTER =
  "review_status.is.null,review_status.eq.draft,review_status.eq.ready,review_status.eq.pending_review,review_status.eq.pending";

function getBearerToken(header: string | null) {
  if (!header) return null;
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return null;
  return header.slice(prefix.length).trim() || null;
}

function isAdminishRole(role: string | null | undefined) {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "admin" || normalized === "owner";
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

    const serviceClient = buildServiceClient(supabaseUrl, serviceRoleKey);
    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("id,role")
      .eq("id", user.id)
      .maybeSingle<{ id: string; role: string | null }>();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    if (!isAdminishRole(profile?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as ReviewActionBody | null;
    const trackId = String(body?.trackId || "").trim();
    const note = String(body?.note || "").trim();

    if (!trackId) {
      return NextResponse.json({ error: "trackId is required" }, { status: 400 });
    }

    const { data: track, error } = await serviceClient
      .from("tracks")
      .update({
        review_status: "rejected",
        reviewed_at: new Date().toISOString(),
        review_note: note || null,
      })
      .eq("id", trackId)
      .eq("ready_for_review", true)
      .eq("is_published", false)
      .or(PENDING_REVIEW_STATUS_FILTER)
      .select("id,title,review_status,reviewed_at,review_note,is_published")
      .maybeSingle<{
        id: string;
        title: string | null;
        review_status: string | null;
        reviewed_at: string | null;
        review_note: string | null;
        is_published: boolean | null;
      }>();

    if (error) {
      console.error("Studio review reject error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!track) {
      return NextResponse.json(
        { error: "Review track not found or no longer reviewable" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      trackId: track.id,
      title: track.title,
      reviewStatus: track.review_status,
      reviewedAt: track.reviewed_at,
      reviewNote: track.review_note,
      isPublished: Boolean(track.is_published),
    });
  } catch (error: any) {
    console.error("Studio review reject unexpected error:", error);
    return NextResponse.json(
      { error: error?.message || "Unexpected reject error" },
      { status: 500 }
    );
  }
}
