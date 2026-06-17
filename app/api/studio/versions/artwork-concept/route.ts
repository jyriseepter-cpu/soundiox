import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type SaveArtworkConceptBody = {
  trackVersionId?: string | null;
  trackGroupId?: string | null;
  artworkConcept?: unknown;
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

async function columnExists(
  serviceClient: ReturnType<typeof buildServiceClient>,
  table: string,
  column: string
) {
  const { error } = await serviceClient.from(table).select(column).limit(1);
  return !error;
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

    const body = (await request.json().catch(() => null)) as SaveArtworkConceptBody | null;
    const trackVersionId = String(body?.trackVersionId || "").trim();
    const trackGroupId = String(body?.trackGroupId || "").trim();

    if (!trackVersionId || !trackGroupId) {
      return NextResponse.json(
        { error: "trackVersionId and trackGroupId are required" },
        { status: 400 }
      );
    }

    if (!body?.artworkConcept || typeof body.artworkConcept !== "object") {
      return NextResponse.json({ error: "artworkConcept is required" }, { status: 400 });
    }

    const serviceClient = buildServiceClient(supabaseUrl, serviceRoleKey);
    const hasArtworkConcept = await columnExists(serviceClient, "track_versions", "artwork_concept");
    if (!hasArtworkConcept) {
      return NextResponse.json(
        { error: "track_versions.artwork_concept is not available" },
        { status: 500 }
      );
    }

    const { data: project, error: projectError } = await serviceClient
      .from("studio_projects")
      .select("id")
      .eq("user_id", user.id)
      .eq("track_group_id", trackGroupId)
      .maybeSingle<{ id: string }>();

    if (projectError) {
      return NextResponse.json({ error: projectError.message }, { status: 500 });
    }

    if (!project?.id) {
      return NextResponse.json({ error: "Studio project not found" }, { status: 404 });
    }

    const { data: version, error: versionError } = await serviceClient
      .from("track_versions")
      .update({ artwork_concept: body.artworkConcept })
      .eq("id", trackVersionId)
      .eq("track_group_id", trackGroupId)
      .select("id,track_group_id,artwork_concept")
      .maybeSingle();

    if (versionError) {
      return NextResponse.json({ error: versionError.message }, { status: 500 });
    }

    if (!version?.id) {
      return NextResponse.json({ error: "Track version not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, version });
  } catch (error: any) {
    console.error("Studio artwork concept save unexpected error:", error);
    return NextResponse.json(
      { error: error?.message || "Unexpected artwork concept save error" },
      { status: 500 }
    );
  }
}
