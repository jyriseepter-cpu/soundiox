import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type DeleteProjectBody = {
  trackGroupId?: string | null;
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

async function getUserFromRequest(request: NextRequest) {
  const { supabaseUrl, anonKey, serviceRoleKey } = readRequiredEnv();
  const accessToken = getBearerToken(request.headers.get("authorization"));

  if (!accessToken) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      serviceClient: null,
      user: null,
    };
  }

  const authClient = buildAuthClient(supabaseUrl, anonKey);
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(accessToken);

  if (userError || !user) {
    return {
      error: NextResponse.json(
        { error: userError?.message || "Invalid user session" },
        { status: 401 }
      ),
      serviceClient: null,
      user: null,
    };
  }

  return {
    error: null,
    serviceClient: buildServiceClient(supabaseUrl, serviceRoleKey),
    user,
  };
}

export async function DELETE(request: NextRequest) {
  try {
    const { error, serviceClient, user } = await getUserFromRequest(request);
    if (error || !serviceClient || !user) return error;

    const body = (await request.json().catch(() => null)) as DeleteProjectBody | null;
    const trackGroupId = String(body?.trackGroupId || "").trim();

    if (!trackGroupId) {
      return NextResponse.json({ error: "trackGroupId is required" }, { status: 400 });
    }

    const { error: deleteError } = await serviceClient
      .from("studio_projects")
      .delete()
      .eq("user_id", user.id)
      .eq("track_group_id", trackGroupId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      deletedFrom: "studio_projects",
      trackGroupId,
    });
  } catch (error: any) {
    console.error("Studio project delete unexpected error:", error);
    return NextResponse.json(
      { error: error?.message || "Unexpected studio project delete error" },
      { status: 500 }
    );
  }
}
