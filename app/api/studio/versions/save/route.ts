import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type SaveStudioVersionBody = {
  trackGroupId?: string | null;
  parentVersionId?: string | null;
  title?: string;
  projectName?: string;
  genre?: string;
  audioUrl?: string;
  artworkUrl?: string | null;
  artworkConcept?: unknown;
  duration?: number | null;
  createdFrom?: string | null;
  generationMode?: string | null;
  importedSource?: string | null;
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

    const body = (await request.json().catch(() => null)) as SaveStudioVersionBody | null;
    const title = String(body?.title || "").trim();
    const projectName = String(body?.projectName || title).trim() || title;
    const audioUrl = String(body?.audioUrl || "").trim();
    const requestedTrackGroupId = String(body?.trackGroupId || "").trim();
    const trackGroupId = requestedTrackGroupId || randomUUID();
    const generationMode = String(body?.generationMode || "import").trim() || "import";
    const createdFrom = String(body?.createdFrom || "draft").trim() || "draft";
    const importedSource = String(body?.importedSource || "").trim();

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    if (!audioUrl) {
      return NextResponse.json({ error: "Audio URL is required" }, { status: 400 });
    }

    const serviceClient = buildServiceClient(supabaseUrl, serviceRoleKey);
    const hasRootVersionId = await columnExists(serviceClient, "track_versions", "root_version_id");

    if (requestedTrackGroupId) {
      const { data: project, error: projectError } = await serviceClient
        .from("studio_projects")
        .select("user_id")
        .eq("track_group_id", requestedTrackGroupId)
        .maybeSingle<{ user_id: string }>();

      if (projectError) {
        return NextResponse.json({ error: projectError.message }, { status: 500 });
      }

      if (project?.user_id && project.user_id !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    await serviceClient
      .from("studio_projects")
      .upsert(
        {
          user_id: user.id,
          track_group_id: trackGroupId,
          project_name: projectName,
        },
        { onConflict: "track_group_id" }
      );

    const { data: latestVersion, error: latestError } = await serviceClient
      .from("track_versions")
      .select(hasRootVersionId ? "id,version_number,root_version_id,is_original" : "id,version_number,is_original")
      .eq("track_group_id", trackGroupId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; version_number: number | null; root_version_id?: string | null; is_original?: boolean | null }>();

    if (latestError) {
      return NextResponse.json({ error: latestError.message }, { status: 500 });
    }

    const nextVersionNumber = (latestVersion?.version_number || 0) + 1;
    const isOriginal = nextVersionNumber === 1;
    const requestedParentVersionId = String(body?.parentVersionId || "").trim();
    const versionId = randomUUID();
    const insertPayload: Record<string, unknown> = {
      id: versionId,
      generation_job_id: null,
      parent_version_id: isOriginal ? null : requestedParentVersionId || latestVersion?.id || null,
      track_group_id: trackGroupId,
      version_number: nextVersionNumber,
      title,
      version_label: isOriginal ? "Original" : `Version ${nextVersionNumber}`,
      provider: createdFrom === "import" ? "studio-import" : "studio-draft",
      generation_mode: generationMode,
      prompt: [
        "Persisted from local Studio draft before stem preparation.",
        body?.genre ? `Genre: ${String(body.genre).trim()}` : "",
        `Created from: ${createdFrom}`,
      ]
        .filter(Boolean)
        .join("\n"),
      lyrics: null,
      vocal_mode: null,
      audio_url: audioUrl,
      artwork_url: body?.artworkUrl || null,
      storage_path: null,
      duration:
        typeof body?.duration === "number" && Number.isFinite(body.duration)
          ? body.duration
          : null,
      is_original: isOriginal,
    };

    if (hasRootVersionId) {
      insertPayload.root_version_id = isOriginal
        ? versionId
        : latestVersion?.root_version_id || latestVersion?.id || requestedParentVersionId || versionId;
    }

    if (
      body?.artworkConcept &&
      typeof body.artworkConcept === "object" &&
      (await columnExists(serviceClient, "track_versions", "artwork_concept"))
    ) {
      insertPayload.artwork_concept = body.artworkConcept;
    }

    if (importedSource && (await columnExists(serviceClient, "track_versions", "imported_source"))) {
      insertPayload.imported_source = importedSource;
    }

    const versionSelect = hasRootVersionId
      ? "id,parent_version_id,root_version_id,track_group_id,version_number,title,version_label,provider,generation_mode,prompt,vocal_mode,audio_url,artwork_url,storage_path,duration,is_original,created_at"
      : "id,parent_version_id,track_group_id,version_number,title,version_label,provider,generation_mode,prompt,vocal_mode,audio_url,artwork_url,storage_path,duration,is_original,created_at";
    const trackVersionsTable = (serviceClient as any).from("track_versions");
    const { data: version, error: versionError } = await trackVersionsTable
      .insert(insertPayload)
      .select(versionSelect)
      .single();

    if (versionError || !version) {
      return NextResponse.json(
        { error: versionError?.message || "Failed to save Studio version" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      trackGroupId,
      trackVersionId: version.id,
      version,
    });
  } catch (error: any) {
    console.error("Studio version save unexpected error:", error);
    return NextResponse.json(
      { error: error?.message || "Unexpected Studio version save error" },
      { status: 500 }
    );
  }
}
