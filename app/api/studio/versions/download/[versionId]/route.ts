import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "tracks";

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

function sanitizeFilenamePart(value: string, fallback: string) {
  return (
    value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 120)
      .trim() || fallback
  );
}

function buildDownloadFilename(artist: string, title: string) {
  const safeArtist = sanitizeFilenamePart(artist, "AI Artist");
  const safeTitle = sanitizeFilenamePart(title, "soundiox-version");
  return `${safeArtist} - ${safeTitle}.mp3`;
}

function encodeRFC5987Value(value: string) {
  return encodeURIComponent(value)
    .replace(/['()]/g, escape)
    .replace(/\*/g, "%2A");
}

function buildStorageObjectUrl(supabaseUrl: string, storagePath: string) {
  const normalizedPath = storagePath.trim().replace(/^\/+/, "");
  if (!normalizedPath) return "";
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;

  const pathWithoutBucket = normalizedPath.startsWith(`${SUPABASE_BUCKET}/`)
    ? normalizedPath.slice(SUPABASE_BUCKET.length + 1)
    : normalizedPath;

  return `${supabaseUrl}/storage/v1/object/${SUPABASE_BUCKET}/${pathWithoutBucket}`;
}

async function columnExists(
  serviceClient: ReturnType<typeof buildServiceClient>,
  table: string,
  column: string
) {
  const { error } = await serviceClient.from(table).select(column).limit(1);
  return !error;
}

type RouteContext = {
  params: Promise<{ versionId?: string }> | { versionId?: string };
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { supabaseUrl, anonKey, serviceRoleKey } = readRequiredEnv();
    const params = await context.params;
    const versionId = String(params?.versionId || "").trim();

    if (!versionId) {
      return NextResponse.json({ error: "versionId is required" }, { status: 400 });
    }

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
    const hasTrackVersionArtist = await columnExists(serviceClient, "track_versions", "artist");
    const { data: version, error: versionError } = await serviceClient
      .from("track_versions")
      .select(
        [
          "id",
          "title",
          hasTrackVersionArtist ? "artist" : "",
          "track_group_id",
          "audio_url",
          "storage_path",
        ]
          .filter(Boolean)
          .join(",")
      )
      .eq("id", versionId)
      .maybeSingle<{
        id: string;
        title: string | null;
        artist?: string | null;
        track_group_id: string | null;
        audio_url: string | null;
        storage_path: string | null;
      }>();

    if (versionError) {
      return NextResponse.json({ error: versionError.message }, { status: 500 });
    }

    if (!version?.id) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    const trackGroupId = String(version.track_group_id || "").trim();
    if (!trackGroupId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
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
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    let artistName = String(version.artist || "").trim();
    if (!artistName) {
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle<{ display_name: string | null }>();
      artistName = String(profile?.display_name || "").trim();
    }

    const audioUrl = String(version.audio_url || "").trim();
    const storagePath = String(version.storage_path || "").trim();
    const sourceUrl = audioUrl || buildStorageObjectUrl(supabaseUrl, storagePath);

    if (!sourceUrl) {
      return NextResponse.json({ error: "Audio missing" }, { status: 400 });
    }

    const audioResponse = await fetch(sourceUrl, {
      headers: audioUrl
        ? undefined
        : {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
      cache: "no-store",
    });

    if (!audioResponse.ok) {
      return NextResponse.json(
        { error: `Audio fetch failed with status ${audioResponse.status}` },
        { status: 502 }
      );
    }

    const audioBytes = await audioResponse.arrayBuffer();
    const filename = buildDownloadFilename(artistName || "AI Artist", version.title || "soundiox-version");

    return new NextResponse(audioBytes, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeRFC5987Value(filename)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error: any) {
    console.error("Studio version download unexpected error:", error);
    return NextResponse.json(
      { error: error?.message || "Unexpected version download error" },
      { status: 500 }
    );
  }
}
