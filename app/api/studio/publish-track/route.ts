import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isSoundioXGenre } from "@/lib/genres";

export const runtime = "nodejs";

type PublishTrackBody = {
  trackVersionId?: string;
  trackGroupId?: string;
  title?: string;
  artist?: string;
  genre?: string;
  visibility?: "draft" | "private" | "public";
  versionNote?: string;
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

function normalizeVisibility(value: unknown) {
  const normalized = String(value || "draft").trim().toLowerCase();
  if (normalized === "private" || normalized === "public") return normalized;
  return "draft";
}

async function getTrackSourceColumnSupport(serviceClient: ReturnType<typeof buildServiceClient>) {
  const { error } = await serviceClient
    .from("tracks")
    .select("source_track_version_id,source_track_group_id")
    .limit(1);

  return !error;
}

async function trackColumnExists(
  serviceClient: ReturnType<typeof buildServiceClient>,
  column: string
) {
  const { error } = await serviceClient.from("tracks").select(column).limit(1);
  return !error;
}

async function loadTrackVersionForPublish(args: {
  serviceClient: ReturnType<typeof buildServiceClient>;
  trackVersionId: string;
  trackGroupId: string;
}) {
  const baseSelect = "id,track_group_id,audio_url,artwork_url,provider,generation_mode,version_label";
  const extendedSelect = `${baseSelect},artwork_concept`;

  let result = await args.serviceClient
    .from("track_versions")
    .select(extendedSelect)
    .eq("id", args.trackVersionId)
    .eq("track_group_id", args.trackGroupId)
    .maybeSingle<{
      id: string;
      track_group_id: string;
      audio_url: string | null;
      artwork_url: string | null;
      provider: string | null;
      generation_mode: string | null;
      version_label: string | null;
      artwork_concept?: unknown | null;
    }>();

  if (result.error) {
    result = await args.serviceClient
      .from("track_versions")
      .select(baseSelect)
      .eq("id", args.trackVersionId)
      .eq("track_group_id", args.trackGroupId)
      .maybeSingle<{
        id: string;
        track_group_id: string;
        audio_url: string | null;
        artwork_url: string | null;
        provider: string | null;
        generation_mode: string | null;
        version_label: string | null;
        artwork_concept?: unknown | null;
      }>();
  }

  return result;
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

    const body = (await request.json().catch(() => null)) as PublishTrackBody | null;
    const trackVersionId = String(body?.trackVersionId || "").trim();
    const trackGroupId = String(body?.trackGroupId || "").trim();
    const title = String(body?.title || "").trim();
    const artist = String(body?.artist || "").trim();
    const genre = String(body?.genre || "").trim();
    const versionNote = String(body?.versionNote || "").trim();
    const requestedVisibility = normalizeVisibility(body?.visibility);

    if (!trackVersionId) {
      return NextResponse.json({ error: "trackVersionId is required" }, { status: 400 });
    }

    if (!trackGroupId) {
      return NextResponse.json({ error: "trackGroupId is required" }, { status: 400 });
    }

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    if (!artist) {
      return NextResponse.json({ error: "Artist is required" }, { status: 400 });
    }

    if (!isSoundioXGenre(genre)) {
      return NextResponse.json({ error: "A valid SoundioX genre is required" }, { status: 400 });
    }

    const serviceClient = buildServiceClient(supabaseUrl, serviceRoleKey);
    const { data: version, error: versionError } = await loadTrackVersionForPublish({
      serviceClient,
      trackVersionId,
      trackGroupId,
    });

    if (versionError) {
      console.error("Studio publish track version lookup error:", versionError);
      return NextResponse.json({ error: versionError.message }, { status: 500 });
    }

    if (!version?.audio_url) {
      return NextResponse.json(
        { error: "Selected version is missing audio" },
        { status: 400 }
      );
    }

    const hasTrackSourceColumns = await getTrackSourceColumnSupport(serviceClient);
    if (!hasTrackSourceColumns) {
      return NextResponse.json(
        {
          error:
            "tracks source metadata columns are missing. Apply supabase/migrations/20260515_add_studio_import_metadata.sql before submitting Studio drafts.",
        },
        { status: 500 }
      );
    }

    const draftPayload: Record<string, unknown> = {
      title,
      artist,
      genre,
      audio_url: version.audio_url,
      artwork_url: version.artwork_url || null,
      user_id: user.id,
      is_published: false,
      is_promo: false,
      plays_all_time: 0,
      plays_this_month: 0,
    };

    draftPayload.source_track_version_id = trackVersionId;
    draftPayload.source_track_group_id = trackGroupId;

    if (version.artwork_concept && (await trackColumnExists(serviceClient, "artwork_concept"))) {
      draftPayload.artwork_concept = version.artwork_concept;
    }

    if (version.provider && (await trackColumnExists(serviceClient, "source_provider"))) {
      draftPayload.source_provider = version.provider;
    }

    if (version.generation_mode && (await trackColumnExists(serviceClient, "source_generation_mode"))) {
      draftPayload.source_generation_mode = version.generation_mode;
    }

    if (version.version_label && (await trackColumnExists(serviceClient, "source_version_label"))) {
      draftPayload.source_version_label = version.version_label;
    }

    if (versionNote) {
      if (await trackColumnExists(serviceClient, "version_note")) {
        draftPayload.version_note = versionNote;
      } else if (await trackColumnExists(serviceClient, "source_version_note")) {
        draftPayload.source_version_note = versionNote;
      }
    }

    console.log(
      "PUBLISH TRACK PAYLOAD",
      JSON.stringify(
        {
          title,
          artwork_url_exists: Boolean(version.artwork_url),
          source_track_version_id: trackVersionId,
          source_track_group_id: trackGroupId,
        },
        null,
        2
      )
    );

    let existingDraft: { id: string } | null = null;

    const { data: existing, error: existingError } = await serviceClient
      .from("tracks")
      .select("id")
      .eq("user_id", user.id)
      .eq("source_track_version_id", trackVersionId)
      .eq("is_published", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (existingError) {
      console.error("Studio publish existing draft lookup error:", existingError);
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    existingDraft = existing ?? null;

    if (existingDraft) {
      const updatePayload = { ...draftPayload };
      delete updatePayload.user_id;
      delete updatePayload.plays_all_time;
      delete updatePayload.plays_this_month;

      const { data: track, error: updateError } = await serviceClient
        .from("tracks")
        .update(updatePayload)
        .eq("id", existingDraft.id)
        .select("id,title,is_published")
        .single<{ id: string; title: string; is_published: boolean | null }>();

      if (updateError || !track) {
        console.error("Studio publish tracks update error:", updateError);
        return NextResponse.json(
          { error: updateError?.message || "Failed to update SoundioX draft" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        trackId: track.id,
        title: track.title,
        visibility: requestedVisibility,
        savedVisibility: "draft",
        isPublished: false,
        updatedExistingDraft: true,
      });
    }

    const { data: track, error: insertError } = await serviceClient
      .from("tracks")
      .insert(draftPayload)
      .select("id,title,is_published")
      .single<{ id: string; title: string; is_published: boolean | null }>();

    if (insertError || !track) {
      console.error("Studio publish tracks insert error:", insertError);
      return NextResponse.json(
        { error: insertError?.message || "Failed to save SoundioX draft" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      trackId: track.id,
      title: track.title,
      visibility: requestedVisibility,
      savedVisibility: "draft",
      isPublished: false,
      updatedExistingDraft: false,
    });
  } catch (error: any) {
    console.error("Studio publish unexpected error:", error);
    return NextResponse.json(
      { error: error?.message || "Unexpected studio publish error" },
      { status: 500 }
    );
  }
}
