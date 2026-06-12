import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type StudioProjectBody = {
  trackGroupId?: string | null;
  projectName?: string;
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

export async function GET(request: NextRequest) {
  try {
    const { error, serviceClient, user } = await getUserFromRequest(request);
    if (error || !serviceClient || !user) return error;

    const trackGroupId = request.nextUrl.searchParams.get("trackGroupId")?.trim();

    if (!trackGroupId) {
      return NextResponse.json({ project: null });
    }

    const { data: project, error: projectError } = await serviceClient
      .from("studio_projects")
      .select("id,track_group_id,project_name,updated_at")
      .eq("user_id", user.id)
      .eq("track_group_id", trackGroupId)
      .maybeSingle<{
        id: string;
        track_group_id: string | null;
        project_name: string;
        updated_at: string | null;
      }>();

    if (projectError) {
      console.error("Studio project lookup error:", projectError);
      return NextResponse.json({ error: projectError.message }, { status: 500 });
    }

    return NextResponse.json({
      project: project
        ? {
            id: project.id,
            trackGroupId: project.track_group_id,
            projectName: project.project_name,
            updatedAt: project.updated_at,
          }
        : null,
    });
  } catch (error: any) {
    console.error("Studio project lookup unexpected error:", error);
    return NextResponse.json(
      { error: error?.message || "Unexpected studio project lookup error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error, serviceClient, user } = await getUserFromRequest(request);
    if (error || !serviceClient || !user) return error;

    const body = (await request.json().catch(() => null)) as StudioProjectBody | null;
    const projectName = String(body?.projectName || "").trim();
    const trackGroupId = String(body?.trackGroupId || "").trim() || null;

    if (!projectName) {
      return NextResponse.json({ error: "projectName is required" }, { status: 400 });
    }

    let existingProjectId: string | null = null;

    if (trackGroupId) {
      const { data: existingProject, error: existingError } = await serviceClient
        .from("studio_projects")
        .select("id")
        .eq("track_group_id", trackGroupId)
        .maybeSingle<{ id: string }>();

      if (existingError) {
        console.error("Studio project existing lookup error:", existingError);
        return NextResponse.json({ error: existingError.message }, { status: 500 });
      }

      existingProjectId = existingProject?.id ?? null;
    } else {
      const { data: existingProject, error: existingError } = await serviceClient
        .from("studio_projects")
        .select("id")
        .eq("user_id", user.id)
        .is("track_group_id", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string }>();

      if (existingError) {
        console.error("Studio project draft lookup error:", existingError);
        return NextResponse.json({ error: existingError.message }, { status: 500 });
      }

      existingProjectId = existingProject?.id ?? null;
    }

    const mutation = existingProjectId
      ? serviceClient
          .from("studio_projects")
          .update({
            project_name: projectName,
            track_group_id: trackGroupId,
          })
          .eq("id", existingProjectId)
          .eq("user_id", user.id)
      : serviceClient.from("studio_projects").insert({
          user_id: user.id,
          track_group_id: trackGroupId,
          project_name: projectName,
        });

    const { data: project, error: saveError } = await mutation
      .select("id,track_group_id,project_name,updated_at")
      .single<{
        id: string;
        track_group_id: string | null;
        project_name: string;
        updated_at: string | null;
      }>();

    if (saveError || !project) {
      console.error("Studio project save error:", saveError);
      return NextResponse.json(
        { error: saveError?.message || "Failed to save Studio project" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      project: {
        id: project.id,
        trackGroupId: project.track_group_id,
        projectName: project.project_name,
        updatedAt: project.updated_at,
      },
    });
  } catch (error: any) {
    console.error("Studio project save unexpected error:", error);
    return NextResponse.json(
      { error: error?.message || "Unexpected studio project save error" },
      { status: 500 }
    );
  }
}
