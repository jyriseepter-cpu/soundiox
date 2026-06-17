import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

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

    const { data: projects, error: projectsError } = await serviceClient
      .from("studio_projects")
      .select("id,track_group_id,project_name,created_at,updated_at")
      .eq("user_id", user.id)
      .not("track_group_id", "is", null);

    if (projectsError) {
      return NextResponse.json({ error: projectsError.message }, { status: 500 });
    }

    const projectRows = (projects || [])
      .map((project: any) => ({
        id: String(project?.id || ""),
        track_group_id: String(project?.track_group_id || "").trim(),
        project_name: String(project?.project_name || "").trim(),
        created_at: project?.created_at ?? null,
        updated_at: project?.updated_at ?? null,
      }))
      .filter((project) => project.track_group_id);

    if (projectRows.length === 0) {
      return NextResponse.json({ drafts: [] });
    }

    const groupIds = Array.from(new Set(projectRows.map((project) => project.track_group_id)));
    const { data: versions, error: versionsError } = await serviceClient
      .from("track_versions")
      .select("id,title,audio_url,artwork_url,track_group_id,created_at")
      .in("track_group_id", groupIds)
      .not("audio_url", "is", null)
      .order("created_at", { ascending: false });

    if (versionsError) {
      return NextResponse.json({ error: versionsError.message }, { status: 500 });
    }

    const latestVersionByGroup = new Map<string, any>();
    (versions || []).forEach((version: any) => {
      const groupId = String(version?.track_group_id || "").trim();
      if (!groupId || latestVersionByGroup.has(groupId)) return;
      latestVersionByGroup.set(groupId, version);
    });

    const drafts = projectRows
      .map((project) => {
        const latestVersion = latestVersionByGroup.get(project.track_group_id);
        if (!latestVersion?.id || !latestVersion?.audio_url) return null;

        return {
          id: String(latestVersion.id),
          title: project.project_name || latestVersion.title || "Untitled Studio Project",
          artist: "AI Artist",
          genre: "Electronic",
          audio_url: latestVersion.audio_url,
          artwork_url: latestVersion.artwork_url || null,
          created_at: latestVersion.created_at || project.updated_at || project.created_at || null,
          is_published: false,
          source_track_group_id: project.track_group_id,
          source_track_version_id: String(latestVersion.id),
        };
      })
      .filter(Boolean);

    return NextResponse.json({ drafts });
  } catch (error: any) {
    console.error("Studio generated projects list unexpected error:", error);
    return NextResponse.json(
      { error: error?.message || "Unexpected Studio projects list error" },
      { status: 500 }
    );
  }
}
